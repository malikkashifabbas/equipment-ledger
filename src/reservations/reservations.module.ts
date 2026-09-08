import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Asset, AssetSchema } from '../assets/asset.schema';
import { Reservation, ReservationSchema } from './reservation.schema';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { Worker, WorkerSchema } from '../workers/worker.schema';
@Module({ imports: [MongooseModule.forFeature([{ name: Asset.name, schema: AssetSchema }, { name: Worker.name, schema: WorkerSchema }, { name: Reservation.name, schema: ReservationSchema }])], controllers: [ReservationsController], providers: [ReservationsService] })
export class ReservationsModule {}
