import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { Asset, AssetDocument } from '../assets/asset.schema';
import { ReservationStatus } from '../common/domain';
import { Movement, MovementDocument } from '../ledger/movement.schema';
import { replayTimeline } from '../ledger/timeline';
import { Reservation, ReservationDocument } from '../reservations/reservation.schema';

async function check() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const assets = app.get<Model<AssetDocument>>(getModelToken(Asset.name));
  const movements = app.get<Model<MovementDocument>>(getModelToken(Movement.name));
  const reservations = app.get<Model<ReservationDocument>>(getModelToken(Reservation.name));
  const errors: string[] = [];
  try {
    for (const asset of await assets.find().lean()) {
      try {
        const state = replayTimeline(await movements.find({ assetId: asset._id }).lean());
        if ((state.holderId ?? null) !== (asset.currentHolderId ? String(asset.currentHolderId) : null)) errors.push(`${asset.code}: projection holder differs from ledger`);
        if ((state.dueAt?.toISOString() ?? null) !== (asset.currentDueAt?.toISOString() ?? null)) errors.push(`${asset.code}: projection due time differs from ledger`);
        if (state.serviceStatus !== asset.serviceStatus && (await movements.countDocuments({ assetId: asset._id })) > 0) errors.push(`${asset.code}: projection service status differs from ledger`);
      } catch (error) { errors.push(`${asset.code}: ${(error as Error).message}`); }
      const rows = await reservations.find({ assetId: asset._id, status: ReservationStatus.ACTIVE }).sort({ startAt: 1 }).lean();
      for (let i = 1; i < rows.length; i++) if (rows[i].startAt < rows[i - 1].endAt) errors.push(`${asset.code}: overlapping active reservations`);
    }
    if (errors.length) throw new Error(`Invariant violations:\n${errors.join('\n')}`);
    console.log('All ledger invariants hold.');
  } finally { await app.close(); }
}
void check();
