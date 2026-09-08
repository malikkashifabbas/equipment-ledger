import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { MovementType } from '../common/domain';

@Schema({ collection: 'movements', versionKey: false })
export class Movement {
  @Prop({ type: Types.ObjectId, required: true, ref: 'Asset', index: true }) assetId!: Types.ObjectId;
  @Prop({ enum: MovementType, required: true }) type!: MovementType;
  @Prop({ type: Types.ObjectId, ref: 'Worker', default: null }) workerId!: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, ref: 'Reservation', default: null }) reservationId!: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) dueAt!: Date | null;
  @Prop({ required: true }) effectiveAt!: Date;
  @Prop({ required: true, default: Date.now }) recordedAt!: Date;
  @Prop({ type: Types.ObjectId, ref: 'Worker', required: true }) recordedById!: Types.ObjectId;
  @Prop({ required: true, unique: true }) idempotencyKey!: string;
  @Prop({ type: Types.ObjectId, ref: 'Movement', default: null }) supersedesMovementId!: Types.ObjectId | null;
  @Prop({ type: Object, default: null }) correction!: { effectiveAt?: Date; reason: string } | null;
  @Prop({ type: String, default: null }) note!: string | null;
}
export type MovementDocument = HydratedDocument<Movement>;
export const MovementSchema = SchemaFactory.createForClass(Movement);
MovementSchema.index({ assetId: 1, effectiveAt: 1, recordedAt: 1, _id: 1 });
MovementSchema.index({ supersedesMovementId: 1 }, { sparse: true });
