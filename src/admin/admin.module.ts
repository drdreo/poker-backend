import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppService } from '../app.service';
import { PokerGateway } from '../poker/poker.gateway';
import { TableService } from '../poker/table/table.service';
import { AdminController } from './admin.controller';

@Module({
    imports: [ConfigModule],
    controllers: [AdminController],
    providers: [Logger, AppService, TableService, PokerGateway]
})
export class AdminModule {}
