import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Worker, WorkerSchema } from './worker.schema';
import { WorkersController } from './workers.controller';
@Module({ imports: [MongooseModule.forFeature([{ name: Worker.name, schema: WorkerSchema }])], controllers: [WorkersController] })
export class WorkersModule {}
