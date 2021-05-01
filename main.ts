import { Logger, LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { Config, Environment } from './src/config/configuration';
import { SocketAdapter } from './src/socket-adapter';

const logLevels: LogLevel[] = process.env.NODE_ENV === 'dev' ? ['log', 'error', 'warn', 'debug', 'verbose'] : ['error', 'warn', 'log'];

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        logger: logLevels
    });
    const configService: ConfigService<Config> = app.get(ConfigService);
    const logger = app.get(Logger);
    logger.setContext('main.ts');
    logger.log(`Running app in {${ configService.get<Environment>('ENV') }} environment!`);

    const whitelist = configService.get<string[]>('WHITELIST');
    logger.log(`Enabling CORS for ${ whitelist.join(' & ') }`);

    app.enableCors({
        origin: function (origin, callback) {
            if (whitelist.indexOf(origin) !== -1 || !origin) {
                callback(null, true);
            } else {
                callback(new Error(`Origin[${ origin }] Not allowed by CORS`));
            }
        },
        allowedHeaders: 'X-Requested-With,X-HTTP-Method-Override,Content-Type,OPTIONS,Accept,Observe,sentry-trace',
        methods: 'GET,PUT,POST,DELETE,UPDATE,OPTIONS',
        credentials: true
    });

    app.useWebSocketAdapter(new SocketAdapter(app, whitelist));

    const port = configService.get<number>('PORT');
    logger.log(`App listening on port {${ port }}`);
    await app.listen(port);
}

bootstrap();
