import { IsBoolean, IsDateString, IsMongoId, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class IssueAssetDto {
  @IsMongoId() workerId!: string;
  @IsMongoId() recordedById!: string;
  @IsDateString() effectiveAt!: string;
  @IsUUID() idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsDateString() dueAt!: string;
  @IsOptional() @IsMongoId() reservationId?: string;
}

export class ReturnAssetDto {
  @IsMongoId() workerId!: string;
  @IsMongoId() recordedById!: string;
  @IsDateString() effectiveAt!: string;
  @IsUUID() idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsBoolean() damaged?: boolean;
}

export class CorrectMovementDto {
  @IsMongoId() movementId!: string;
  @IsMongoId() recordedById!: string;
  @IsDateString() effectiveAt!: string;
  @IsString() @MaxLength(500) reason!: string;
  @IsUUID() idempotencyKey!: string;
}

export class ServiceStatusDto {
  @IsMongoId() recordedById!: string;
  @IsDateString() effectiveAt!: string;
  @IsUUID() idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
