import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Asset, AssetSchema } from '../assets/asset.schema';
import { Reservation, ReservationSchema } from '../reservations/reservation.schema';
import { Worker, WorkerSchema } from '../workers/worker.schema';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { Movement, MovementSchema } from './movement.schema';

@Module({ imports: [MongooseModule.forFeature([{ name: Asset.name, schema: AssetSchema }, { name: Worker.name, schema: WorkerSchema }, { name: Movement.name, schema: MovementSchema }, { name: Reservation.name, schema: ReservationSchema }])], controllers: [LedgerController], providers: [LedgerService], exports: [LedgerService] })
export class LedgerModule {}
