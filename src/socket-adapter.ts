import { INestApplicationContext } from '@nestjs/common';
import { MessageMappingProperties, AbstractWsAdapter } from '@nestjs/websockets';
import { DISCONNECT_EVENT } from '@nestjs/websockets/constants';
import { instrument } from '@socket.io/admin-ui';
import { fromEvent, Observable } from 'rxjs';
import { filter, mergeMap, share, map, takeUntil, first } from 'rxjs/operators';
import { Server, ServerOptions, Socket } from 'socket.io';

export const isUndefined = (obj: any): obj is undefined =>
    typeof obj === 'undefined';
export const isFunction = (fn: any): boolean => typeof fn === 'function';
export const isNil = (obj: any): obj is null | undefined =>
    isUndefined(obj) || obj === null;

// TODO: Using this until socket.io v3 is part of Nest.js, see: https://github.com/nestjs/nest/issues/5676

export class SocketAdapter extends AbstractWsAdapter {

    constructor(app?: INestApplicationContext, private originWhitelist?: string []) {
        super(app);
    }

    public create(port: number, options?: ServerOptions & { namespace?: string; server?: any }): Server {
        if (!options) {
            return this.createIOServer(port);
        }
        const { namespace, server, ...opt } = options;
        return server && isFunction(server.of)
            ? server.of(namespace)
            : namespace
                ? this.createIOServer(port, opt).of(namespace)
                : this.createIOServer(port, opt);
    }

    public createIOServer(port: number, options?: any): any {
        let server;
        if (this.httpServer && port === 0) {
            server = new Server(this.httpServer, {
                cors: {
                    origin: (origin, callback) => {
                        if (this.originWhitelist.indexOf(origin) !== -1 || !origin) {
                            callback(null, true);
                        } else {
                            callback(new Error(`Origin[${ origin }] Not allowed by CORS`));
                        }
                    },
                    allowedHeaders: 'X-Requested-With,X-HTTP-Method-Override,Content-Type,OPTIONS,Accept,Observe,sentry-trace',
                    methods: 'GET,PUT,POST,DELETE,UPDATE,OPTIONS',
                    credentials: true
                },
                allowEIO3: true
            });
        } else {
            server = new Server(port, options);
        }

        instrument(server, {
            auth: false,
        });
        return server;
    }

    public bindMessageHandlers(
        socket: Socket,
        handlers: MessageMappingProperties[],
        transform: (data: any) => Observable<any>
    ) {
        const disconnect$ = fromEvent(socket, DISCONNECT_EVENT).pipe(
            share(),
            first()
        );

        handlers.forEach(({ message, callback }) => {
            const source$ = fromEvent(socket, message).pipe(
                mergeMap((payload: any) => {
                    const { data, ack } = this.mapPayload(payload);
                    return transform(callback(data, ack)).pipe(
                        filter((response: any) => !isNil(response)),
                        map((response: any) => [response, ack])
                    );
                }),
                takeUntil(disconnect$)
            );
            source$.subscribe(([response, ack]) => {
                if (response.event) {
                    return socket.emit(response.event, response.data);
                }
                isFunction(ack) && ack(response);
            });
        });
    }

    public mapPayload(payload: unknown): { data: any; ack?: Function } {
        if (!Array.isArray(payload)) {
            if (isFunction(payload)) {
                return { data: undefined, ack: payload as Function };
            }
            return { data: payload };
        }
        const lastElement = payload[payload.length - 1];
        const isAck = isFunction(lastElement);
        if (isAck) {
            const size = payload.length - 1;
            return {
                data: size === 1 ? payload[0] : payload.slice(0, size),
                ack: lastElement
            };
        }
        return { data: payload };
    }
}
