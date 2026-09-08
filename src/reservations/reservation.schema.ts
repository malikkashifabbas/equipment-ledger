import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ReservationStatus } from '../common/domain';

@Schema({ timestamps: true })
export class Reservation {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Asset', index: true }) assetId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, ref: 'Worker' }) workerId!: Types.ObjectId;
  @Prop({ required: true }) startAt!: Date;
  @Prop({ required: true }) endAt!: Date;
  @Prop({ enum: ReservationStatus, default: ReservationStatus.ACTIVE }) status!: ReservationStatus;
  @Prop({ required: true, unique: true }) idempotencyKey!: string;
  @Prop({ type: String, default: null }) cancellationReason!: string | null;
  @Prop({ type: Date, default: null }) cancelledAt!: Date | null;
  @Prop({ type: Types.ObjectId, ref: 'Worker', default: null }) cancelledById!: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) fulfilledAt!: Date | null;
  @Prop({ type: Types.ObjectId, ref: 'Movement', default: null }) fulfilledByMovementId!: Types.ObjectId | null;
}
export type ReservationDocument = HydratedDocument<Reservation>;
export const ReservationSchema = SchemaFactory.createForClass(Reservation);
ReservationSchema.index({ assetId: 1, status: 1, startAt: 1, endAt: 1 });
