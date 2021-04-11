import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppService } from '../app.service';
import { PokerModule } from '../poker/poker.module';
import { AdminController } from './admin.controller';

@Module({
    imports: [ConfigModule, PokerModule],
    controllers: [AdminController],
    providers: [Logger, AppService]
})
export class AdminModule {}
