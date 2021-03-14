import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { TableService } from './table/table.service';

export interface Dog {
    name: string;
    type: string;
}

@Injectable()
export class PokerHealthIndicator extends HealthIndicator {

    constructor(private tableService: TableService) {
        super();
    }

    async isHealthy(key: string): Promise<HealthIndicatorResult> {
        const emptyTables = this.tableService.tables.filter(table => table.players.length === 0);
        const isHealthy = emptyTables.length === 0;
        const result = this.getStatus(key, isHealthy, { emptyTables: emptyTables.length });

        if (isHealthy) {
            return result;
        }
        throw new HealthCheckError('Poker check failed', result);
    }
}
