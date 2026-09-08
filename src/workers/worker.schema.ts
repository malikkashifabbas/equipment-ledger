import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class Certification {
  @Prop({ required: true }) type!: string;
  @Prop({ required: true }) expiresAt!: Date;
}
const CertificationSchema = SchemaFactory.createForClass(Certification);

@Schema({ timestamps: true })
export class Worker {
  @Prop({ required: true, unique: true }) employeeCode!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ type: [CertificationSchema], default: [] }) certifications!: Certification[];
}
export type WorkerDocument = HydratedDocument<Worker>;
export const WorkerSchema = SchemaFactory.createForClass(Worker);
