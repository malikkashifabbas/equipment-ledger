import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AssetsModule } from './assets/assets.module';
import { LedgerModule } from './ledger/ledger.module';
import { ReservationsModule } from './reservations/reservations.module';
import { WorkersModule } from './workers/workers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI', 'mongodb://localhost:27017/equipment-ledger?replicaSet=rs0'),
        retryWrites: true,
      }),
    }),
    AssetsModule,
    WorkersModule,
    LedgerModule,
    ReservationsModule,
  ],
})
export class AppModule {}
