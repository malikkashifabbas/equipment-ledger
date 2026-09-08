import { IsMongoId, IsString, MaxLength } from 'class-validator';
export class CancelReservationDto {
  @IsMongoId() recordedById!: string;
  @IsString() @MaxLength(500) reason!: string;
}
