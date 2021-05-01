import { UseInterceptors, Controller, Get } from '@nestjs/common';
import { AppService } from '../app.service';
import { PokerGateway } from '../poker/poker.gateway';
import { TableService } from '../poker/table/table.service';
import { SentryInterceptor } from '../sentry.interceptor';

@UseInterceptors(SentryInterceptor)
@Controller('api/admin')
export class AdminController {
    constructor(private readonly appService: AppService, private readonly pokerGateway: PokerGateway, private readonly tableService: TableService) {}

    @Get('/info')
    getAdminInfo(): any {
        return {
            tables: this.tableService.getAllAdminTables(),
            sockets: [],
            uptime: (new Date().getTime() - this.appService.uptime.getTime()) / 1000,
            lastPlayerAdded: this.pokerGateway.lastPlayerAdded
        };
    }

}
