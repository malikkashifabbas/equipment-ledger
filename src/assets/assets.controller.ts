import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Asset, AssetDocument } from './asset.schema';

@Controller('assets')
export class AssetsController {
  constructor(@InjectModel(Asset.name) private readonly assets: Model<AssetDocument>) {}
  @Get() list(@Query('search') search?: string) { return this.assets.find(search ? { $or: [{ code: new RegExp(search, 'i') }, { name: new RegExp(search, 'i') }] } : {}).sort({ code: 1 }).lean(); }
  @Get(':id') async one(@Param('id') id: string) { const asset = await this.assets.findById(id).lean(); if (!asset) throw new NotFoundException('Asset not found'); return asset; }
}
