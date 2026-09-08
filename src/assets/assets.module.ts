import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Asset, AssetSchema } from './asset.schema';
import { AssetsController } from './assets.controller';
@Module({ imports: [MongooseModule.forFeature([{ name: Asset.name, schema: AssetSchema }])], controllers: [AssetsController] })
export class AssetsModule {}
