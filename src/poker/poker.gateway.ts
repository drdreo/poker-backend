import { Logger, UseInterceptors } from '@nestjs/common';
import {
    ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer, WsResponse,
    WsException
} from '@nestjs/websockets';
import { Client, Server, Socket } from 'socket.io';
import {
    PokerEvent, GameStatus, GameRoundUpdate, GameBoardUpdate, GameDealerUpdate, GameCurrentPlayer, GameWinners, GamePotUpdate,
    GamePlayersUpdate, PlayerBet, HomeInfo, PlayerEvent, ServerJoined, PlayerChecked, PlayerCalled, PlayerFolded, MaxBetUpdate, PlayerKicked
} from '../../shared/src';
import { SentryInterceptor } from '../sentry.interceptor';
import { Player } from './Player';
import { TableService } from './table/table.service';
import { InvalidConfigError, GameStartedError, TableFullError } from './table/table.utils';
import { TableCommand, TableCommandName } from './table/TableCommand';
import { remapCards } from './utils';

interface Connection {
    id: string;
    playerID: string | null;
}

@UseInterceptors(SentryInterceptor)
@WebSocketGateway()
export class PokerGateway implements OnGatewayConnection, OnGatewayDisconnect {

    @WebSocketServer() server: Server;

    private connections: Connection[] = [];

    lastPlayerAdded: Date;


    private logger = new Logger(PokerGateway.name);

    constructor(private tableService: TableService) {

        this.tableService.tableCommands$
            .subscribe((cmd: TableCommand) => this.handleTableCommands(cmd));
    }

    private sendTo(recipient: string, event: PokerEvent, data?: any) {
        this.server.to(recipient).emit(event, data);
    }

    private sendToAll(event: PokerEvent, data?: any) {
        this.server.emit(event, data);
    }

    private getConnectionById(socketId: string): Connection {
        return this.connections.find(conn => conn.id === socketId);
    }

    public getConnections(): Connection[] {
        return this.connections;
    }

    handleConnection(socket: Client) {
        this.logger.debug(`A new client{${ socket.id }} connected!`);

        this.connections.push({ id: socket.id, playerID: null });
    }

    handleDisconnect(socket: Client) {
        this.logger.debug(`A client{${ socket.id }} disconnected!`);

        this.connections = this.connections.filter(conn => conn.id !== socket.id);

        this.handlePlayerDisconnect(socket['playerID'], socket['table']);
    }


    /**
     * Called when a socket disconnects or a player opens the home page (to tell the server that a player navigated away from the table)
     * @param playerID
     * @param table
     */
    private handlePlayerDisconnect(playerID: string | undefined, table: string | undefined) {

        if (playerID && this.tableService.playerExists(playerID)) {
            this.logger.debug(`Player[${ playerID }] left!`);
            this.tableService.playerLeft(playerID);

            if (table) {
                this.sendTo(table, PokerEvent.PlayerLeft, { playerID });
            } else {
                this.logger.error(`Player[${ playerID }] disconnected or left, but table[${ table }] no longer exists!`);
            }
        }
    }

    // to prevent sockets from still receiving game messages. Leaves the table and unsets all socket data
    private disconnectSocket(socket: any, table: string) {
        socket.leave(table);
        socket['table'] = undefined;
        socket['playerID'] = null;
    }

    @SubscribeMessage(PlayerEvent.JoinRoom)
    onJoinRoom(@ConnectedSocket() socket: Socket, @MessageBody() { playerID, roomName, playerName, config }): WsResponse<ServerJoined> {
        this.lastPlayerAdded = new Date();

        this.logger.debug(`Player[${ playerName }] joining!`);
        let sanitizedRoom = roomName.toLowerCase();
        socket.join(sanitizedRoom);
        socket['table'] = sanitizedRoom;
        socket['playerID'] = playerID; // either overwrite existing one, reset it if its undefined

        let newPlayerID;

        // existing Player needs to reconnect
        if (playerID && this.tableService.playerExists(playerID)) {
            this.logger.debug(`Player[${ playerName }] needs to reconnect!`);
            newPlayerID = playerID;
            const table = this.tableService.playerReconnected(playerID);
            this.logger.debug(`Players last table[${ table.name }] found!`);

            if (table.name !== sanitizedRoom) {
                this.logger.warn(`Player tried to join other table than they were playing on!`);
                // leave the passed table and join old one again
                socket.leave(sanitizedRoom);
                sanitizedRoom = table.name;
                socket.join(sanitizedRoom);
                socket['table'] = sanitizedRoom;
            }

        } else if (playerName) {   // new Player wants to create or join
            this.logger.debug(`New Player[${ playerName }] wants to create or join [${ sanitizedRoom }]!`);
            try {
                const response = this.tableService.createOrJoinTable(sanitizedRoom, playerName, config);
                newPlayerID = response.playerID;
                this.sendHomeInfo();
            } catch (e) {
                if (e instanceof InvalidConfigError) {
                    throw new WsException('Invalid config provided!');
                }

                const table = this.tableService.getTable(sanitizedRoom);
                if (e instanceof GameStartedError || e instanceof TableFullError) {
                    if (table && table.pokerConfig.spectatorsAllowed) {
                        this.logger.debug('Couldnt create or join table, join as spectator!');
                        this.onJoinSpectator(socket, { roomName });
                        return { event: PokerEvent.Joined, data: { playerID, table: sanitizedRoom } };
                    } else {
                        this.logger.debug('Couldnt create or join table, but spectating is not allowed!');
                        this.disconnectSocket(socket, sanitizedRoom);
                        throw new WsException('Spectating is not allowed!');
                    }
                } else {
                    console.error(e);
                }
            }

        } else {
            // Spectator joining
            throw new Error('Spectator should not be able to join this way!');
        }

        // connect the socket with its playerID
        socket['playerID'] = newPlayerID;
        socket['table'] = sanitizedRoom;
        this.connections.find(conn => conn.id === socket.id).playerID = newPlayerID;


        // inform everyone what someone joined
        this.tableService.getTable(sanitizedRoom).sendPlayersUpdate();
        return { event: PokerEvent.Joined, data: { playerID: newPlayerID, table: sanitizedRoom } };
    }

    @SubscribeMessage(PlayerEvent.SpectatorJoin)
    onJoinSpectator(@ConnectedSocket() socket: Socket, @MessageBody() { roomName }) {
        const sanitizedRoom = roomName.toLowerCase();

        this.logger.debug(`Spectator trying to join table[${ sanitizedRoom }]!`);
        const table = this.tableService.getTable(sanitizedRoom);
        if (table && table.pokerConfig.spectatorsAllowed) {
            socket.join(sanitizedRoom);
            socket['table'] = sanitizedRoom;

            // tell the spectator all information if game started: players, game status, board, pot
            this.onRequestUpdate(socket);

            return { event: PokerEvent.Joined, data: { table: sanitizedRoom } };
        } else {
            throw new WsException('Spectating is not allowed!');
        }
    }

    @SubscribeMessage(PlayerEvent.RequestUpdate)
    onRequestUpdate(@ConnectedSocket() socket: Socket) {
        const table = this.tableService.getTable(socket['table']);
        if (!table) {
            throw new WsException('Can not request data. Table not found!');
        }

        table.sendPlayersUpdate(socket.id);

        const gameStatus = table.getGameStatus();
        // tell the spectator all information if game started: players, game status, board, pot
        if (gameStatus === GameStatus.Started) {
            table.sendCurrentPlayer(socket.id);
            table.sendDealerUpdate(socket.id);
            table.sendGameBoardUpdate(socket.id);
            table.sendPotUpdate(socket.id);
            table.sendMaxBetUpdate(socket.id);
        }
        table.sendGameStatusUpdate(socket.id);
    }


    @SubscribeMessage(PlayerEvent.StartGame)
    onStartGame(@ConnectedSocket() socket: Socket) {
        const table = socket['table'];
        this.tableService.startGame(table);
        this.sendHomeInfo();
    }

    @SubscribeMessage(PlayerEvent.Leave)
    onPlayerLeave(@ConnectedSocket() socket: Socket) {
        const playerID = socket['playerID'];
        const table = socket['table'];
        this.handlePlayerDisconnect(playerID, table);
    }

    @SubscribeMessage(PlayerEvent.VoteKick)
    onVoteKick(@ConnectedSocket() socket: Socket, @MessageBody() { kickPlayerID }) {
        const playerID = socket['playerID'];
        const table = socket['table'];
        this.tableService.voteKick(table, playerID, kickPlayerID);
    }

    /**
     *
     * Game Actions
     */
    @SubscribeMessage(PlayerEvent.Check)
    onPlayerCheck(@ConnectedSocket() socket: Socket) {
        const playerID = socket['playerID'];
        const table = socket['table'];
        this.tableService.check(table, playerID);
        this.sendTo(table, PokerEvent.PlayerChecked, { playerID } as PlayerChecked);
    }

    @SubscribeMessage(PlayerEvent.Call)
    onPlayerCall(@ConnectedSocket() socket: Socket) {
        const playerID = socket['playerID'];
        const table = socket['table'];
        this.tableService.call(table, playerID);
        this.sendTo(table, PokerEvent.PlayerCalled, { playerID } as PlayerCalled);
    }

    @SubscribeMessage(PlayerEvent.Bet)
    onPlayerBet(@ConnectedSocket() socket: Socket, @MessageBody() coins: number) {
        const playerID = socket['playerID'];
        const table = socket['table'];
        this.tableService.bet(table, playerID, coins);
    }

    @SubscribeMessage(PlayerEvent.Fold)
    onPlayerFold(@ConnectedSocket() socket: Socket) {
        const playerID = socket['playerID'];
        const table = socket['table'];
        this.tableService.fold(table, playerID);
    }


    /**
     *    Table Actions
     */

    private handleTableCommands({ name, data, recipient, table }: TableCommand) {
        this.logger.verbose(`Table[${ table }] - ${ name }:`);
        this.logger.debug(data);

        const receiver = recipient ? recipient : table;
        switch (name) {

            case TableCommandName.HomeInfo:
                this.sendHomeInfo();
                break;

            case TableCommandName.GameStarted:
                this.sendTo(receiver, PokerEvent.GameStarted);
                break;

            case TableCommandName.PlayerUpdate:
                if (recipient) {
                    const con = this.getConnectionById(recipient);
                    const player = this.tableService.getTable(table).getPlayer(con.playerID);
                    if (player) {
                        this.logger.debug('Sending only the recipient the players update');
                        this.sendPlayerUpdateIndividually(table, [player]);
                    }
                } else {
                    this.sendPlayerUpdateToSpectators(table);
                    this.sendPlayerUpdateIndividually(table, data.players);
                }

                break;

            case TableCommandName.PlayerBet: {
                const response: PlayerBet = { playerID: data.playerID, bet: data.bet, maxBet: data.maxBet, type: data.type };
                this.sendTo(receiver, PokerEvent.PlayerBet, response);
            }
                break;

            case TableCommandName.PlayerFolded: {
                const response: PlayerFolded = { playerID: data.playerID };
                this.sendTo(receiver, PokerEvent.PlayerFolded, response);
            }
                break;

            case TableCommandName.PlayersCards: {
                const response: GamePlayersUpdate = { players: data.players };
                this.sendTo(receiver, PokerEvent.PlayersCards, response);
            }
                break;

            case TableCommandName.PotUpdate: {
                const response: GamePotUpdate = { pot: data.pot, sidePots: data.sidePots };
                this.sendTo(receiver, PokerEvent.PotUpdate, response);
            }
                break;

            case TableCommandName.MaxBetUpdate: {
                const response: MaxBetUpdate = { maxBet: data.maxBet };
                this.sendTo(receiver, PokerEvent.MaxBetUpdate, response);
            }
                break;

            case TableCommandName.GameEnded:
                this.sendTo(receiver, PokerEvent.GameEnded);
                break;

            case TableCommandName.GameStatus:
                this.sendTo(receiver, PokerEvent.GameStatus, data.gameStatus as GameStatus);
                break;

            case TableCommandName.GameWinners: {
                const response: GameWinners = { winners: data.winners };
                this.sendTo(receiver, PokerEvent.GameWinners, response);
            }
                break;

            case TableCommandName.CurrentPlayer: {
                const response: GameCurrentPlayer = { currentPlayerID: data.currentPlayerID };
                this.sendTo(receiver, PokerEvent.CurrentPlayer, response);
            }
                break;

            case TableCommandName.Dealer: {
                const response: GameDealerUpdate = { dealerPlayerID: data.dealerPlayerID };
                this.sendTo(receiver, PokerEvent.DealerUpdate, response);
            }
                break;

            case TableCommandName.BoardUpdated: {
                const response: GameBoardUpdate = { board: data.board };
                this.sendTo(receiver, PokerEvent.BoardUpdate, response);
            }
                break;

            case TableCommandName.NewRound: {
                const response: GameRoundUpdate = { round: data.round };
                this.sendTo(receiver, PokerEvent.NewRound, response);
            }
                break;

            case TableCommandName.TableClosed :
                this.sendTo(receiver, PokerEvent.TableClosed);
                break;

            case TableCommandName.PlayerKicked :
                const response: PlayerKicked = { kickedPlayer: data.kickedPlayer };
                this.sendTo(receiver, PokerEvent.PlayerKick, response);
                break;
            default:
                this.logger.warn(`Command[${ name }] was not handled!`);
                break;
        }
    }

    private sendPlayerUpdateIndividually(table: string, players: Player[]) {
        // tell every player the cards specifically
        for (const player of players) {

            const conn = this.connections.find(conn => conn.playerID === player.id);

            // only tell currently connected players the update
            if (conn && !player.disconnected) {
                const playersData = this.tableService.getTable(table).getPlayersPreview(); //TODO: for performance do not query each time

                // find the player in the data again and reveal cards
                playersData.find(p => p.id === player.id)['cards'] = remapCards(player.cards);

                this.sendTo(conn.id, PokerEvent.PlayersUpdate, { players: playersData } as GamePlayersUpdate);
            }
        }
    }

    private sendPlayerUpdateToSpectators(tableName: string) {
        const table = this.tableService.getTable(tableName);
        const playersData = table.getPlayersPreview();
        const room = this.server.sockets.adapter.rooms[tableName];

        for (const socketID in room.sockets) {
            const playerId = this.getConnectionById(socketID).playerID;
            const isPlayer = table.isPlayer(playerId);
            if (!isPlayer) {
                this.sendTo(tableName, PokerEvent.PlayersUpdate, { players: playersData } as GamePlayersUpdate);
            }
        }
    }

    private sendHomeInfo() {
        const response: HomeInfo = {
            tables: this.tableService.getAllTables(),
            players: this.tableService.getPlayersCount()
        };
        this.sendToAll(PokerEvent.HomeInfo, response);
    }
}
