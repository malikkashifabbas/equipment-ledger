import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationsService } from './reservations.service';
import { CancelReservationDto } from './dto/cancel-reservation.dto';
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}
  @Get() list() { return this.reservations.list(); }
  @Post() create(@Body() dto: CreateReservationDto) { return this.reservations.create(dto); }
  @Patch(':id/cancel') cancel(@Param('id') id: string, @Body() dto: CancelReservationDto) { return this.reservations.cancel(id, dto); }
}
