import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { PokerConfig } from '@shared/src';
import { Subject } from 'rxjs';
import { Config } from '../../config/configuration';
import { TableConfig } from '../../config/table.config';
import { Table } from './Table';
import { TableCommand, TableCommandName } from './TableCommand';

@Injectable()
export class TableService {

    tables: Table[] = [];

    private _tableCommands$ = new Subject<TableCommand>();
    tableCommands$ = this._tableCommands$.asObservable();

    private logger = new Logger(TableService.name);
    private readonly CONFIG: TableConfig;
    private destroyTimeout: NodeJS.Timeout;

    constructor(private configService: ConfigService<Config>) {
        this.CONFIG = this.configService.get<TableConfig>('TABLE');
    }

    /**********************
     * HELPER METHODS
     **********************/

    sendCommand(command: TableCommand) {
        this._tableCommands$.next(command);
    }

    createTable(name: string, config?: PokerConfig): Table {
        const table = new Table(this.CONFIG, name, config);
        table.commands$ = this._tableCommands$;
        this.tables.push(table);
        return table;
    }

    playerExists(playerID: string): boolean {
        return this.tables.some((table) => {
            return table.players.some(player => player.id === playerID);
        });
    }

    getTable(name: string): Table {
        return this.tables.find(table => table.name === name);
    }

    getAllTables() {
        return this.tables.map(table => {
            return { name: table.name, started: table.hasGame() };
        });
    }

    getPlayersCount() {
        return this.tables.reduce((prev, cur) => prev + cur.players.length, 0);
    }

    playerLeft(playerID: string) {
        for (const table of this.tables) {
            const player = table.getPlayer(playerID);
            if (player) {
                player.disconnected = true;
                // if every player disconnected, remove the table after some time
                if (this.destroyTimeout) {
                    clearTimeout(this.destroyTimeout);
                }

                this.destroyTimeout = setTimeout(() => {
                    if (table.players.every(player => player.disconnected)) {
                        table.destroy();
                        this.tables = this.tables.filter(t => t.name !== table.name);
                        this.sendCommand({ name: TableCommandName.HomeInfo, table: table.name });
                        this.logger.debug(`Table[${ table.name }] removed!`);
                    }
                }, this.CONFIG.AUTO_DESTROY_DELAY);
                return;
            }
        }
    }

    playerReconnected(playerID: string): Table {
        for (const table of this.tables) {
            const player = table.players.find(player => player.id === playerID);
            if (player) {
                player.disconnected = false;
                return table;
            }
        }
    }

    /**
     *
     * @returns the new players ID
     */
    createOrJoinTable(tableName: string, playerName: string, config?: PokerConfig): { playerID: string } {
        let table = this.getTable(tableName);

        if (!table) {
            this.logger.debug(`Player[${ playerName }] created a table!`);
            table = this.createTable(tableName, config);
        }

        this.logger.debug(`Player[${ playerName }] joining Table[${ tableName }]!`);

        const playerID = table.addPlayer(playerName, 1000);

        return { playerID };
    }

    startGame(tableName: string) {
        const table = this.getTable(tableName);
        if (!table) {
            throw new WsException(`Can not start game on Table[${ tableName }] because it does not exist.`);
        }
        if (table.hasGame()) {
            this.logger.warn(`Table[${ tableName }] has already a game in progress!`);
        }
        table.newGame();
    }

    voteKick(tableName: string, playerID: string, kickPlayerID: string) {
        const table = this.getTable(tableName);
        if (!table) {
            throw new WsException(`Can not vote kick on Table[${ tableName }] because it does not exist.`);
        }

        table.voteKick(playerID, kickPlayerID);
    }

    /***********************
     * Game methods
     ************************/

    check(tableName: string, playerID: string) {
        const table = this.tables.find(table => table.name === tableName);

        if (table) {
            if (table.hasGame() || table.isGameEnded()) {
                table.check(playerID);
            } else {
                throw new WsException(`Game has not started or has ended!`);
            }
        } else {
            throw new WsException(`Table[${ tableName }] does no longer exist!`);
        }
    }

    call(tableName: string, playerID: string) {
        const table = this.tables.find(table => table.name === tableName);

        if (table) {
            if (table.hasGame() || table.isGameEnded()) {
                this.logger.debug(`Player[${ playerID }] called!`);
                table.call(playerID);
            } else {
                throw new WsException(`Game has not started or has ended!`);
            }
        } else {
            throw new WsException(`Table[${ tableName }] does no longer exist!`);
        }
    }

    bet(tableName: string, playerID: string, coins: number) {
        const table = this.tables.find(table => table.name === tableName);

        if (table) {
            if (table.hasGame() || table.isGameEnded()) {
                table.bet(playerID, coins);
            } else {
                throw new WsException(`Game has not started or has ended!`);
            }
        } else {
            throw new WsException(`Table[${ tableName }] does no longer exist!`);
        }
    }

    fold(tableName: string, playerID: string) {
        const table = this.tables.find(table => table.name === tableName);

        if (table) {
            if (table.hasGame() || table.isGameEnded()) {
                table.fold(playerID);
            } else {
                throw new WsException(`Game has not started or has ended!`);
            }
        } else {
            throw new WsException(`Table[${ tableName }] does no longer exist!`);
        }
    }
}
