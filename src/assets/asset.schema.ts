import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ServiceStatus } from '../common/domain';

@Schema({ timestamps: true, optimisticConcurrency: true })
export class Asset {
  createdAt!: Date;
  updatedAt!: Date;
  @Prop({ required: true, unique: true, trim: true }) code!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) kind!: string;
  @Prop({ type: String, default: null }) requiredCertification!: string | null;
  @Prop({ enum: ServiceStatus, default: ServiceStatus.IN_SERVICE }) serviceStatus!: ServiceStatus;
  @Prop({ type: Types.ObjectId, ref: 'Worker', default: null }) currentHolderId!: Types.ObjectId | null;
  @Prop({ type: Types.ObjectId, ref: 'Movement', default: null }) currentIssueMovementId!: Types.ObjectId | null;
  @Prop({ type: Date, default: null }) currentDueAt!: Date | null;
  @Prop({ default: 0 }) ledgerVersion!: number;
}
export type AssetDocument = HydratedDocument<Asset>;
export const AssetSchema = SchemaFactory.createForClass(Asset);
AssetSchema.index({ serviceStatus: 1, currentHolderId: 1 });
