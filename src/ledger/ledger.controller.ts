import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ServiceStatus } from '../common/domain';
import { CorrectMovementDto, IssueAssetDto, ReturnAssetDto, ServiceStatusDto } from './dto/ledger.dto';
import { LedgerService } from './ledger.service';

@Controller()
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}
  @Get('assets/:assetId/history') history(@Param('assetId') id: string) { return this.ledger.history(id); }
  @Post('assets/:assetId/issue') issue(@Param('assetId') id: string, @Body() dto: IssueAssetDto) { return this.ledger.issue(id, dto); }
  @Post('assets/:assetId/return') returnAsset(@Param('assetId') id: string, @Body() dto: ReturnAssetDto) { return this.ledger.returnAsset(id, dto); }
  @Post('assets/:assetId/corrections') correct(@Param('assetId') id: string, @Body() dto: CorrectMovementDto) { return this.ledger.correct(id, dto); }
  @Patch('assets/:assetId/out-of-service') out(@Param('assetId') id: string, @Body() dto: ServiceStatusDto) { return this.ledger.setServiceStatus(id, ServiceStatus.OUT_OF_SERVICE, dto); }
  @Patch('assets/:assetId/back-in-service') back(@Param('assetId') id: string, @Body() dto: ServiceStatusDto) { return this.ledger.setServiceStatus(id, ServiceStatus.IN_SERVICE, dto); }
  @Get('ledger/as-of') reconstruct(@Query('at') value: string) {
    const at = new Date(value);
    if (!value || Number.isNaN(at.getTime())) throw new BadRequestException('at must be a valid ISO-8601 timestamp');
    return this.ledger.reconstruct(at);
  }
}
