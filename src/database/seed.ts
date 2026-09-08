import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppModule } from '../app.module';
import { Asset, AssetDocument } from '../assets/asset.schema';
import { MovementType, ReservationStatus, ServiceStatus } from '../common/domain';
import { Movement, MovementDocument } from '../ledger/movement.schema';
import { Reservation, ReservationDocument } from '../reservations/reservation.schema';
import { Worker, WorkerDocument } from '../workers/worker.schema';

const oid = (key: string) => new Types.ObjectId(createHash('sha256').update(`equipment-ledger:${key}`).digest('hex').slice(0, 24));
const at = (days: number, hour: number) => new Date(Date.UTC(2026, 8, 8 + days, hour));

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const assets = app.get<Model<AssetDocument>>(getModelToken(Asset.name));
  const workers = app.get<Model<WorkerDocument>>(getModelToken(Worker.name));
  const movements = app.get<Model<MovementDocument>>(getModelToken(Movement.name));
  const reservations = app.get<Model<ReservationDocument>>(getModelToken(Reservation.name));
  try {
    await Promise.all([
      movements.deleteMany({}),
      reservations.deleteMany({}),
      assets.deleteMany({}),
      workers.deleteMany({}),
    ]);
    const workerRows = Array.from({ length: 12 }, (_, i) => ({
      _id: oid(`worker-${i + 1}`), employeeCode: `W-${String(i + 1).padStart(3, '0')}`, name: ['Amina Khan', 'Bilal Ahmed', 'Chen Wei', 'Dalia Noor', 'Ethan Cole', 'Fatima Ali', 'George Mensah', 'Hana Park', 'Isaac Reed', 'Julia Santos', 'Kamran Shah', 'Lina Omar'][i],
      certifications: i === 0 ? [{ type: 'GAS_SAFETY', expiresAt: at(365, 0) }] : i === 1 ? [{ type: 'GAS_SAFETY', expiresAt: at(-1, 0) }] : i === 2 ? [{ type: 'WORK_AT_HEIGHT', expiresAt: at(2, 0) }] : [],
    }));
    const kinds = ['DRILL', 'HARNESS', 'GAS_DETECTOR', 'GRINDER', 'LADDER', 'GENERATOR'];
    const assetRows: Array<{ _id: Types.ObjectId; code: string; name: string; kind: string; requiredCertification: string | null; serviceStatus: ServiceStatus; currentHolderId: Types.ObjectId | null; currentIssueMovementId: Types.ObjectId | null; currentDueAt: Date | null; ledgerVersion: number; createdAt: Date; updatedAt: Date }> = Array.from({ length: 60 }, (_, i) => ({
      _id: oid(`asset-${i + 1}`), code: `${kinds[i % kinds.length].slice(0, 4)}-${String(i + 1).padStart(3, '0')}`, name: `${kinds[i % kinds.length].replace('_', ' ')} ${i + 1}`, kind: kinds[i % kinds.length],
      requiredCertification: kinds[i % kinds.length] === 'GAS_DETECTOR' ? 'GAS_SAFETY' : kinds[i % kinds.length] === 'HARNESS' ? 'WORK_AT_HEIGHT' : null,
      serviceStatus: i === 59 ? ServiceStatus.OUT_OF_SERVICE : ServiceStatus.IN_SERVICE, currentHolderId: null, currentIssueMovementId: null, currentDueAt: null, ledgerVersion: 0, createdAt: at(-30, 0), updatedAt: at(-30, 0),
    }));
    await workers.collection.bulkWrite(workerRows.map((row) => ({ replaceOne: { filter: { _id: row._id }, replacement: row, upsert: true } })));
    await assets.collection.bulkWrite(assetRows.map((row) => ({ replaceOne: { filter: { _id: row._id }, replacement: row, upsert: true } })));

    const keeper = workerRows[11]._id;
    const movementRows: Record<string, unknown>[] = [];
    for (let i = 0; i < 20; i++) {
      const asset = assetRows[i]; const worker = workerRows[(i + 3) % workerRows.length];
      const issueId = oid(`movement-issue-${i}`); const returnId = oid(`movement-return-${i}`);
      const issueAt = at(-29 + i, 8); const returnAt = at(-29 + i, 16);
      movementRows.push({ _id: issueId, assetId: asset._id, type: MovementType.ISSUE, workerId: worker._id, dueAt: at(-29 + i, 18), effectiveAt: issueAt, recordedAt: issueAt, recordedById: keeper, idempotencyKey: `seed-issue-${i}`, supersedesMovementId: null, correction: null, note: 'seed' });
      movementRows.push({ _id: returnId, assetId: asset._id, type: MovementType.RETURN, workerId: worker._id, effectiveAt: returnAt, recordedAt: i === 4 ? at(-29 + i, 19) : returnAt, recordedById: keeper, idempotencyKey: `seed-return-${i}`, supersedesMovementId: null, correction: null, note: 'seed' });
    }
    const outstanding = [20, 21, 22];
    for (const i of outstanding) {
      const issueId = oid(`movement-issue-${i}`), worker = workerRows[(i + 3) % workerRows.length];
      const dueAt = i === 20 ? at(-2, 8) : at(3 + (i - 21), 17);
      movementRows.push({ _id: issueId, assetId: assetRows[i]._id, type: MovementType.ISSUE, workerId: worker._id, dueAt, effectiveAt: at(-3 + (i - 20), 8), recordedAt: at(-3 + (i - 20), 8), recordedById: keeper, idempotencyKey: `seed-issue-${i}`, supersedesMovementId: null, correction: null, note: i === 20 ? 'seed overdue' : 'seed outstanding' });
      assetRows[i].currentHolderId = worker._id; assetRows[i].currentIssueMovementId = issueId; assetRows[i].currentDueAt = dueAt; assetRows[i].ledgerVersion = 1;
      await assets.updateOne({ _id: assetRows[i]._id }, { $set: { currentHolderId: worker._id, currentIssueMovementId: issueId, currentDueAt: dueAt, ledgerVersion: 1 } });
    }
    const target = movementRows.find((m) => m.idempotencyKey === 'seed-return-2')!;
    movementRows.push({ _id: oid('movement-correction-1'), assetId: target.assetId, type: MovementType.CORRECTION, workerId: null, effectiveAt: target.effectiveAt, recordedAt: at(-20, 18), recordedById: keeper, idempotencyKey: 'seed-correction-1', supersedesMovementId: target._id, correction: { effectiveAt: at(-27, 17), reason: 'Keeper entered return one hour early' }, note: 'seed correction' });
    await movements.collection.bulkWrite(movementRows.map((row) => ({ replaceOne: { filter: { _id: row._id as Types.ObjectId }, replacement: row, upsert: true } })));

    const reservationRows = [
      { _id: oid('reservation-1'), assetId: assetRows[30]._id, workerId: workerRows[2]._id, startAt: at(-5, 9), endAt: at(-5, 12), status: ReservationStatus.MISSED, idempotencyKey: 'seed-reservation-1' },
      { _id: oid('reservation-2'), assetId: assetRows[31]._id, workerId: workerRows[3]._id, startAt: at(2, 9), endAt: at(2, 12), status: ReservationStatus.ACTIVE, idempotencyKey: 'seed-reservation-2' },
      { _id: oid('reservation-3'), assetId: assetRows[32]._id, workerId: workerRows[4]._id, startAt: at(4, 13), endAt: at(4, 17), status: ReservationStatus.ACTIVE, idempotencyKey: 'seed-reservation-3' },
    ];
    await reservations.collection.bulkWrite(reservationRows.map((row) => ({ replaceOne: { filter: { _id: row._id }, replacement: row, upsert: true } })));
    console.log(`Seeded ${assetRows.length} assets, ${workerRows.length} workers, ${movementRows.length} movements and ${reservationRows.length} reservations.`);
  } finally { await app.close(); }
}
void seed();
