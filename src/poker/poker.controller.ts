import { Controller, Get, HttpException, HttpStatus, Param, UseInterceptors } from '@nestjs/common';
import { TableResponse } from '@shared/src';
import { SentryInterceptor } from '../sentry.interceptor';
import { TableService } from './table/table.service';

export interface PokerTable {
    name: string;
    started: boolean;
}

interface HomeInfo {
    tables: PokerTable[];
    players: number;
}

@UseInterceptors(SentryInterceptor)
@Controller('api/poker')
export class PokerController {
    constructor(private readonly tableService: TableService) {}

    @Get('/home')
    getHomeInfo(): HomeInfo {
        return { tables: this.tableService.getAllTables(), players: this.tableService.getPlayersCount() };
    }

    @Get('/table/:name')
    getTable(@Param('name') name): TableResponse {
        const table = this.tableService.getTable(name);
        if (table) {
            return { name: table.name, startTime: table.startTime, players: table.getPlayersPreview(), spectatorsAllowed: table.pokerConfig.spectatorsAllowed };
        }

        throw new HttpException('Table does not exist!', HttpStatus.NOT_FOUND);
    }
}
