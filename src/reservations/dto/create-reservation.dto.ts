import { IsDateString, IsMongoId, IsUUID } from 'class-validator';
export class CreateReservationDto {
  @IsMongoId() assetId!: string;
  @IsMongoId() workerId!: string;
  @IsDateString() startAt!: string;
  @IsDateString() endAt!: string;
  @IsUUID() idempotencyKey!: string;
}
