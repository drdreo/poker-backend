import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { SentryModule } from '@ntegral/nestjs-sentry';
import { LogLevel } from '@sentry/types';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';

import { devConfig, Environment, Config, SentryConfig } from './config/configuration';
import { prodConfig } from './config/configuration.prod';
import { testConfig } from './config/configuration.test';
import { HealthController } from './health/health.controller';
import { PokerModule } from './poker/poker.module';

@Module({
    controllers: [AppController, HealthController],
    imports: [
        TerminusModule,
        SentryModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: async (cfg: ConfigService<Config>) => ({
                dsn: cfg.get<SentryConfig>('SENTRY').DSN,
                environment: cfg.get<Environment>('ENV') === Environment.PROD ? 'production' : 'dev',
                enabled: cfg.get<Environment>('ENV') === Environment.PROD,
                tracesSampleRate: cfg.get('SENTRY').TRACES_SAMPLE_RATE,
                logLevel: LogLevel.Debug //based on sentry.io loglevel //
            }),
            inject: [ConfigService]
        }),
        ConfigModule.forRoot({
            load: [process.env.NODE_ENV === Environment.PROD ? prodConfig : process.env.NODE_ENV === Environment.TEST ? testConfig : devConfig]
        }),
        PokerModule,
        AdminModule
    ]
})
export class AppModule {

}
