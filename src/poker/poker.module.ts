import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PokerController } from './poker.controller';
import { PokerGateway } from './poker.gateway';
import { PokerHealthIndicator } from './poker.health';
import { TableService } from './table/table.service';

@Module({
    imports: [ConfigModule],
    controllers: [PokerController],
    providers: [Logger, PokerHealthIndicator, TableService, PokerGateway],
    exports: [PokerHealthIndicator, TableService, PokerGateway]
})
export class PokerModule {
}
