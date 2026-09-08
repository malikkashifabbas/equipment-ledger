import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Asset, AssetDocument } from '../assets/asset.schema';
import { ReservationStatus, ServiceStatus } from '../common/domain';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { Reservation, ReservationDocument } from './reservation.schema';
import { Worker, WorkerDocument } from '../workers/worker.schema';
import { CancelReservationDto } from './dto/cancel-reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(@InjectConnection() private readonly connection: Connection, @InjectModel(Asset.name) private readonly assets: Model<AssetDocument>, @InjectModel(Worker.name) private readonly workers: Model<WorkerDocument>, @InjectModel(Reservation.name) private readonly reservations: Model<ReservationDocument>) {}
  async list() {
    await this.reservations.updateMany({ status: ReservationStatus.ACTIVE, endAt: { $lte: new Date() } }, { $set: { status: ReservationStatus.MISSED } });
    return this.reservations.find().sort({ startAt: 1 }).lean();
  }
  async cancel(id: string, dto: CancelReservationDto) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Reservation not found');
    if (!(await this.workers.exists({ _id: dto.recordedById }))) throw new NotFoundException('Store keeper not found');
    const reservation = await this.reservations.findOneAndUpdate(
      { _id: id, status: ReservationStatus.ACTIVE },
      { $set: { status: ReservationStatus.CANCELLED, cancellationReason: dto.reason, cancelledAt: new Date(), cancelledById: new Types.ObjectId(dto.recordedById) } },
      { new: true },
    );
    if (reservation) return reservation;
    const existing = await this.reservations.findById(id);
    if (!existing) throw new NotFoundException('Reservation not found');
    if (existing.status === ReservationStatus.CANCELLED) return existing;
    throw new ConflictException(`A ${existing.status.toLowerCase()} reservation cannot be cancelled`);
  }
  async create(dto: CreateReservationDto) {
    const prior = await this.reservations.findOne({ idempotencyKey: dto.idempotencyKey });
    if (prior) return prior;
    const startAt = new Date(dto.startAt), endAt = new Date(dto.endAt);
    if (startAt >= endAt) throw new BadRequestException('Reservation end must be after its start');
    if (startAt < new Date()) throw new BadRequestException('Reservation cannot start in the past');
    if (endAt.getTime() - startAt.getTime() > 30 * 86400000) throw new BadRequestException('Reservation cannot exceed 30 days');
    const session = await this.connection.startSession();
    try {
      let result!: ReservationDocument;
      await session.withTransaction(async () => {
        if (!(await this.workers.exists({ _id: dto.workerId }).session(session))) throw new NotFoundException('Worker not found');
        const asset = await this.assets.findOneAndUpdate({ _id: dto.assetId, serviceStatus: ServiceStatus.IN_SERVICE }, { $inc: { ledgerVersion: 1 } }, { new: true, session });
        if (!asset) throw new NotFoundException('Asset not found or out of service');
        const overlap = await this.reservations.exists({ assetId: asset._id, status: ReservationStatus.ACTIVE, startAt: { $lt: endAt }, endAt: { $gt: startAt } }).session(session);
        if (overlap) throw new ConflictException('Reservation overlaps an existing reservation');
        result = (await this.reservations.create([{ assetId: new Types.ObjectId(dto.assetId), workerId: new Types.ObjectId(dto.workerId), startAt, endAt, idempotencyKey: dto.idempotencyKey }], { session }))[0];
      });
      return result;
    } catch (error: unknown) {
      if ((error as { code?: number }).code === 11000) return this.reservations.findOne({ idempotencyKey: dto.idempotencyKey });
      throw error;
    } finally { await session.endSession(); }
  }
}
