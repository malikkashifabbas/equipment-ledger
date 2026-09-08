import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Asset, AssetDocument } from '../assets/asset.schema';
import { MovementType, ReservationStatus, ServiceStatus } from '../common/domain';
import { Reservation, ReservationDocument } from '../reservations/reservation.schema';
import { Worker, WorkerDocument } from '../workers/worker.schema';
import { CorrectMovementDto, IssueAssetDto, ReturnAssetDto, ServiceStatusDto } from './dto/ledger.dto';
import { Movement, MovementDocument } from './movement.schema';
import { replayTimeline } from './timeline';

@Injectable()
export class LedgerService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Asset.name) private readonly assets: Model<AssetDocument>,
    @InjectModel(Worker.name) private readonly workers: Model<WorkerDocument>,
    @InjectModel(Movement.name) private readonly movements: Model<MovementDocument>,
    @InjectModel(Reservation.name) private readonly reservations: Model<ReservationDocument>,
  ) {}

  async history(assetId: string) {
    if (!Types.ObjectId.isValid(assetId)) throw new NotFoundException('Asset not found');
    return this.movements.find({ assetId: new Types.ObjectId(assetId) }).sort({ recordedAt: 1, _id: 1 }).lean();
  }

  async issue(assetId: string, dto: IssueAssetDto) {
    return this.idempotent(dto.idempotencyKey, async () => this.transaction(async (session) => {
      const [asset, worker] = await Promise.all([
        this.assets.findById(assetId).session(session),
        this.workers.findById(dto.workerId).session(session),
      ]);
      if (!asset) throw new NotFoundException('Asset not found');
      if (!worker) throw new NotFoundException('Worker not found');
      const effectiveAt = new Date(dto.effectiveAt);
      const dueAt = new Date(dto.dueAt);
      if (dueAt <= effectiveAt) throw new UnprocessableEntityException('Due time must be after the issue time');
      if (asset.requiredCertification) {
        const valid = worker.certifications.some((c) => c.type === asset.requiredCertification && c.expiresAt.getTime() > effectiveAt.getTime());
        if (!valid) throw new UnprocessableEntityException(`Worker lacks a valid ${asset.requiredCertification} certification`);
      }
      const movementId = new Types.ObjectId();
      await this.reservations.updateMany({ assetId: asset._id, status: ReservationStatus.ACTIVE, endAt: { $lte: effectiveAt } }, { $set: { status: ReservationStatus.MISSED } }, { session });
      const reservation = dto.reservationId
        ? await this.reservations.findOne({ _id: dto.reservationId, assetId: asset._id, status: ReservationStatus.ACTIVE }).session(session)
        : await this.reservations.findOne({ assetId: asset._id, status: ReservationStatus.ACTIVE, startAt: { $lte: effectiveAt }, endAt: { $gt: effectiveAt } }).session(session);
      if (dto.reservationId && !reservation) throw new ConflictException('Reservation is no longer active for this asset');
      if (reservation) {
        if (String(reservation.workerId) !== String(worker._id)) throw new ConflictException('Asset is reserved for another worker at this time');
        if (effectiveAt < reservation.startAt || effectiveAt >= reservation.endAt) throw new ConflictException('Issue time is outside the reservation window');
      }
      const locked = await this.assets.updateOne(
        { _id: asset._id, currentHolderId: null, serviceStatus: ServiceStatus.IN_SERVICE, ledgerVersion: asset.ledgerVersion },
        { $set: { currentHolderId: worker._id, currentIssueMovementId: movementId, currentDueAt: dueAt }, $inc: { ledgerVersion: 1 } },
        { session },
      );
      if (locked.modifiedCount !== 1) throw new ConflictException('Asset is already issued or unavailable');
      const proposed = { _id: movementId, assetId: asset._id, type: MovementType.ISSUE, workerId: worker._id, reservationId: reservation?._id ?? null, dueAt, effectiveAt, recordedAt: new Date(), recordedById: new Types.ObjectId(dto.recordedById), idempotencyKey: dto.idempotencyKey, note: dto.note ?? null };
      const history = await this.movements.find({ assetId: asset._id }).session(session).lean();
      const state = replayTimeline([...history, proposed]);
      await this.assets.updateOne({ _id: asset._id }, { $set: { currentHolderId: state.holderId ? new Types.ObjectId(state.holderId) : null, currentIssueMovementId: state.holderId === String(worker._id) ? movementId : null, currentDueAt: state.dueAt, serviceStatus: state.serviceStatus } }, { session });
      if (reservation) await this.reservations.updateOne({ _id: reservation._id, status: ReservationStatus.ACTIVE }, { $set: { status: ReservationStatus.FULFILLED, fulfilledAt: effectiveAt, fulfilledByMovementId: movementId } }, { session });
      return (await this.movements.create([proposed], { session }))[0];
    }));
  }

  async returnAsset(assetId: string, dto: ReturnAssetDto) {
    return this.idempotent(dto.idempotencyKey, async () => this.transaction(async (session) => {
      const asset = await this.assets.findById(assetId).session(session);
      if (!asset) throw new NotFoundException('Asset not found');
      if (!asset.currentHolderId) throw new ConflictException('Asset is not currently issued');
      if (String(asset.currentHolderId) !== dto.workerId) throw new ConflictException(`Asset is held by another worker`);
      const movementId = new Types.ObjectId();
      const locked = await this.assets.updateOne(
        { _id: asset._id, currentHolderId: new Types.ObjectId(dto.workerId), ledgerVersion: asset.ledgerVersion },
        { $set: { currentHolderId: null, currentIssueMovementId: null, currentDueAt: null, ...(dto.damaged ? { serviceStatus: ServiceStatus.OUT_OF_SERVICE } : {}) }, $inc: { ledgerVersion: 1 } },
        { session },
      );
      if (locked.modifiedCount !== 1) throw new ConflictException('Asset state changed; refresh and retry');
      const now = new Date();
      const proposed = { _id: movementId, assetId: asset._id, type: MovementType.RETURN, workerId: asset.currentHolderId, effectiveAt: new Date(dto.effectiveAt), recordedAt: now, recordedById: new Types.ObjectId(dto.recordedById), idempotencyKey: dto.idempotencyKey, note: dto.note ?? null };
      const history = await this.movements.find({ assetId: asset._id }).session(session).lean();
      const damagedMovement = dto.damaged ? { _id: new Types.ObjectId(), assetId: asset._id, type: MovementType.OUT_OF_SERVICE, workerId: null, effectiveAt: new Date(dto.effectiveAt), recordedAt: new Date(now.getTime() + 1), recordedById: new Types.ObjectId(dto.recordedById), idempotencyKey: `${dto.idempotencyKey}:damaged`, note: 'Returned damaged' } : null;
      const state = replayTimeline(damagedMovement ? [...history, proposed, damagedMovement] : [...history, proposed]);
      await this.assets.updateOne({ _id: asset._id }, { $set: { currentHolderId: state.holderId ? new Types.ObjectId(state.holderId) : null, currentIssueMovementId: null, currentDueAt: state.dueAt, serviceStatus: state.serviceStatus } }, { session });
      const created = await this.movements.create([proposed], { session });
      if (damagedMovement) await this.movements.create([damagedMovement], { session });
      return created[0];
    }));
  }

  async correct(assetId: string, dto: CorrectMovementDto) {
    return this.idempotent(dto.idempotencyKey, async () => this.transaction(async (session) => {
      const asset = await this.assets.findByIdAndUpdate(assetId, { $inc: { ledgerVersion: 1 } }, { new: true, session });
      if (!asset) throw new NotFoundException('Asset not found');
      const target = await this.movements.findOne({ _id: new Types.ObjectId(dto.movementId), assetId: new Types.ObjectId(assetId), type: { $ne: MovementType.CORRECTION } }).session(session);
      if (!target) throw new NotFoundException('Movement not found');
      if (await this.movements.exists({ supersedesMovementId: target._id }).session(session)) throw new ConflictException('Movement has already been corrected');
      const correction = { _id: new Types.ObjectId(), assetId: asset._id, type: MovementType.CORRECTION, workerId: null, effectiveAt: target.effectiveAt, recordedAt: new Date(), recordedById: new Types.ObjectId(dto.recordedById), idempotencyKey: dto.idempotencyKey, supersedesMovementId: target._id, correction: { effectiveAt: new Date(dto.effectiveAt), reason: dto.reason } };
      const history = await this.movements.find({ assetId }).session(session).lean();
      const state = replayTimeline([...history, correction]);
      await this.assets.updateOne({ _id: asset._id }, { $set: { currentHolderId: state.holderId ? new Types.ObjectId(state.holderId) : null, currentDueAt: state.dueAt, serviceStatus: state.serviceStatus } }, { session });
      return (await this.movements.create([correction], { session }))[0];
    }));
  }

  async setServiceStatus(assetId: string, target: ServiceStatus, dto: ServiceStatusDto) {
    return this.idempotent(dto.idempotencyKey, async () => this.transaction(async (session) => {
      const asset = await this.assets.findById(assetId).session(session);
      if (!asset) throw new NotFoundException('Asset not found');
      if (asset.currentHolderId) throw new ConflictException('Return the asset before changing its service status');
      if (asset.serviceStatus === target) throw new ConflictException(`Asset is already ${target}`);
      const result = await this.assets.updateOne({ _id: asset._id, ledgerVersion: asset.ledgerVersion }, { $set: { serviceStatus: target }, $inc: { ledgerVersion: 1 } }, { session });
      if (result.modifiedCount !== 1) throw new ConflictException('Asset state changed; refresh and retry');
      if (target === ServiceStatus.OUT_OF_SERVICE) await this.reservations.updateMany({ assetId: asset._id, status: ReservationStatus.ACTIVE, endAt: { $gt: new Date() } }, { $set: { status: ReservationStatus.CANCELLED, cancellationReason: dto.reason ?? 'Asset taken out of service' } }, { session });
      return (await this.movements.create([{ assetId: asset._id, type: target === ServiceStatus.OUT_OF_SERVICE ? MovementType.OUT_OF_SERVICE : MovementType.BACK_IN_SERVICE, workerId: null, effectiveAt: new Date(dto.effectiveAt), recordedAt: new Date(), recordedById: new Types.ObjectId(dto.recordedById), idempotencyKey: dto.idempotencyKey, note: dto.reason ?? null }], { session }))[0];
    }));
  }

  async reconstruct(at: Date) {
    const [assets, movements] = await Promise.all([this.assets.find().lean(), this.movements.find({}).lean()]);
    return assets.filter((asset) => !asset.createdAt || asset.createdAt <= at).map((asset) => ({ asset, state: replayTimeline(movements.filter((m) => String(m.assetId) === String(asset._id)), at) }));
  }

  private async idempotent(key: string, work: () => Promise<MovementDocument>) {
    const existing = await this.movements.findOne({ idempotencyKey: key });
    if (existing) return existing;
    try { return await work(); } catch (error: unknown) {
      // A concurrent identical request can lose the asset write race before it
      // reaches the unique-key insert. Re-check after the winner has committed.
      const concurrentlyCreated = await this.movements.findOne({ idempotencyKey: key });
      if (concurrentlyCreated) return concurrentlyCreated;
      throw error;
    }
  }

  private async transaction<T>(work: (session: import('mongoose').ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result!: T;
      await session.withTransaction(async () => { result = await work(session); });
      return result;
    } finally { await session.endSession(); }
  }
}
