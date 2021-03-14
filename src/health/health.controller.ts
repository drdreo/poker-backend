import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HealthCheck, MemoryHealthIndicator } from '@nestjs/terminus';
import { PokerHealthIndicator } from '../poker/poker.health';

@Controller('health')
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private memory: MemoryHealthIndicator,
        private pokerHealthIndicator: PokerHealthIndicator
    ) {}

    @Get()
    @HealthCheck()
    check() {
        return this.health.check([
            async () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024),  //The process should not use more than 150MB memory
            async () => this.memory.checkRSS('memory_rss', 300 * 1024 * 1024), // The process should not have more than 300MB allocated
            () => this.pokerHealthIndicator.isHealthy('poker')
        ]);
    }

    @Get('poker')
    @HealthCheck()
    checkPoker() {
        return this.health.check([
            () => this.pokerHealthIndicator.isHealthy('poker')
        ]);
    }
}
