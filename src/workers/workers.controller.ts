import { Controller, Get } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Worker, WorkerDocument } from './worker.schema';
@Controller('workers')
export class WorkersController {
  constructor(@InjectModel(Worker.name) private readonly workers: Model<WorkerDocument>) {}
  @Get() list() { return this.workers.find().sort({ name: 1 }).lean(); }
}
