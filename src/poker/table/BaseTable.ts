import { Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Subject } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import {
    GameStatus, BetType, RoundType, PlayerOverview, SidePot, SidePotPlayer, DefaultConfig, PokerConfig, Winner
} from '../../../shared/src';
import { TableConfig } from '../../config/table.config';
import { Game } from '../game/Game';
import { rankPlayersHands, getHandWinners } from '../game/Hand';
import { Player } from '../Player';
import mergeDeep, { remapCards, getNextIndex, iterate } from '../utils';
import { validateConfig, InvalidConfigError, TableFullError, GameStartedError } from './table.utils';
import { TableCommand, TableCommandName } from './TableCommand';
import Timeout = NodeJS.Timeout;

const defaultConfig: DefaultConfig = {
    spectatorsAllowed: true,
    isPublic: true,
    turn: {
        time: -1 // -1 = unlimited, other in seconds
    },
    chips: 1000,
    blinds: {
        small: 10,
        big: 20,
        duration: -1 // -1 = fixed, other in ms
    },
    music: false,
    afk: {
        delay: 30000
    },
    players: {
        min: 2,
        max: 8
    },
    table: {
        autoClose: true,
        rebuy: false
    }
};


export class BaseTable {
    private playerColors = [
        '#444444', '#3498db', '#9b59b6',
        '#e67e22', '#3ae374', '#16a085',
        'crimson', '#227093', '#d1ccc0',
        '#34495e', '#673ab7', '#cf6a87'
    ];

    players: Player[] = [];
    pokerConfig: any;

    setDealer(player: Player) {
        const dealer = this.dealer;
        if (dealer) {
            dealer.dealer = false;
        }
        this.players.find(p => p.id === player.id).dealer = true;
    }

    get dealer(): Player {
        return this.players.find(player => player.dealer);
    }

    protected game: Game | undefined;

    commands$: Subject<TableCommand>;

    startTime = new Date();

    protected logger;
    private timeoutHandler: {
        [key: string]: Timeout;
    } = {};

    constructor(protected CONFIG: TableConfig, public name: string, protected customConfig?: PokerConfig) {
        this.logger = new Logger(`Table[${ name }]`);
        this.logger.log(`Created!`);


        this.logger.debug(this.customConfig);

        this.setConfig();

        this.logger.debug(this.pokerConfig);

        if (this.CONFIG.NEXT_GAME_DELAY < this.CONFIG.END_GAME_DELAY) {
            throw Error('Next game must not be triggered before the end game!');
        }

        if (this.pokerConfig.players.min < 2) {
            throw new Error('Parameter [minPlayers] must be a positive integer of a minimum value of 2.');
        }

        if (this.pokerConfig.players.min > this.pokerConfig.players.max) {
            throw new Error('Parameter [minPlayers] must be less than or equal to [maxPlayers].');
        }
    }

    newGame(): void {
        throw new Error('Not Implemented');
    }

    private setConfig(): void {
        this.pokerConfig = { ...defaultConfig };

        if (this.customConfig) {
            this.pokerConfig = mergeDeep(defaultConfig, this.customConfig);
            const valid = validateConfig(this.pokerConfig);
            if (!valid) {
                this.logger.error('Invalid config provided!');
                throw new InvalidConfigError('Invalid config provided!');
            }
        }

        // convert each string to number, "20" -> 20
        iterate(this.pokerConfig, (val) => {
            if (!isNaN(parseInt(val))) {
                return +val;
            }
            return val;
        });
    }

    destroy(): void {
        this.logger.debug(`Destroy!`);

        for (const id in this.timeoutHandler) {
            this.logger.debug('Clearing unfinished timer: ' + id);
            clearTimeout(this.timeoutHandler[id]);
        }
    }

    getGame(): Game {
        return this.game;
    }

    hasGame(): boolean {
        return !!this.game;
    }

    isGameEnded(): boolean {
        return this.game.ended;
    }

    getPlayer(playerID: string): Player {
        return this.players.find(player => player.id === playerID);
    }

    protected hasEveryoneElseFolded(): boolean {
        return this.getActivePlayers().length === 1;
    }

    protected getActivePlayers(): Player[] {
        return this.players.filter(player => !player.folded);
    }

    isPlayer(playerID: string): boolean {
        return this.players.some(player => player.id === playerID);
    }

    protected getPlayerColor(): string {
        return this.playerColors.pop();
    }

    // Test utils method
    getRoundType(): RoundType {
        return this.game.round.type;
    }

    getGameStatus(): GameStatus {
        if (this.game) {
            return this.game.ended ? GameStatus.Ended : GameStatus.Started;
        }
        return GameStatus.Waiting;
    }

    getSidePots(): SidePot[] {
        const pots: SidePot[] = [];
        for (const pot of this.game.sidePots) {
            const potPlayers = pot.players.reduce((prev, cur) => {
                prev.push(Player.getSidePotPlayer(cur));
                return prev;
            }, [] as SidePotPlayer[]);
            pots.push({ amount: pot.amount, players: potPlayers });
        }
        return pots;
    }

    getPlayersPreview(): PlayerOverview[] {
        return this.players.map(player => {
            return Player.getPlayerOverview(player);
        });
    }

    getConfig(): any {
        return { ...this.pokerConfig };
    }

    addPlayer(playerName: string, chips?: number): string {
        if (this.game) {
            throw new GameStartedError('Game already started');
        }

        if (this.players.length < this.pokerConfig.players.max) {
            // create and add a new player
            const playerID = uuidv4();
            chips = chips ? chips : this.pokerConfig.chips;
            this.players.push(new Player(playerID, playerName, this.getPlayerColor(), chips));
            return playerID;
        } else {
            throw new TableFullError('Table is already full!');
        }
    }

    removePlayer(player: Player) {
        this.players = this.players.filter(p => p.id !== player.id);
        this.sendPlayersUpdate();
    }


    protected resetPlayerBets() {
        this.players.map(player => player.bet = null);
    }

    moveDealer(dealerIndex: number) {
        this.setDealer(this.players[getNextIndex(dealerIndex, this.players)]);
    }

    protected nextRound(round: RoundType): RoundType {
        switch (round) {
            case RoundType.Deal:
                this.game.newRound(RoundType.Flop);
                break;
            case RoundType.Flop:
                this.game.newRound(RoundType.Turn);
                break;
            case RoundType.Turn:
                this.game.newRound(RoundType.River);
                break;
            default:
                break;
        }
        this.sendGameBoardUpdate();
        return this.game.round.type;
    }

    protected showAllPlayersCards() {
        this.players.map(player => {
            if (!player.folded) {
                player.showCards = true;
            }
        });

        this.sendPlayersUpdate();
    }

    protected showPlayersCards() {
        this.commands$.next({
            name: TableCommandName.PlayersCards,
            table: this.name,
            data: { players: this.getPlayersPreview() }
        });
    }

    protected removePlayerCards() {
        for (const player of this.players) {
            player.cards = [];
        }
    }

    public getPlayerIndexByID(playerID: string): number {
        return this.players.findIndex(player => player.id === playerID);
    }

    public sendPlayersUpdate(recipient?: string) {
        this.commands$.next({
            name: TableCommandName.PlayerUpdate,
            table: this.name,
            recipient,
            data: { players: this.players }
        });
    }

    public sendPlayerBet(playerID: string, bet: number, type: BetType) {
        this.commands$.next({
            name: TableCommandName.PlayerBet,
            table: this.name,
            data: { playerID, bet, type, maxBet: this.game.getMaxBet() }
        });
    }

    public sendPlayerFold(playerID: string) {
        this.commands$.next({
            name: TableCommandName.PlayerFolded,
            table: this.name,
            data: { playerID }
        });
    }

    public sendPotUpdate(recipient?: string) {
        this.commands$.next({
            name: TableCommandName.PotUpdate,
            table: this.name,
            recipient,
            data: { pot: this.game.pot, sidePots: this.getSidePots() }
        });
    }

    public sendMaxBetUpdate(recipient?: string) {
        this.commands$.next({
            name: TableCommandName.MaxBetUpdate,
            table: this.name,
            recipient,
            data: { maxBet: this.game.getMaxBet() }
        });
    }

    public sendGameBoardUpdate(recipient?: string) {
        this.commands$.next({
            name: TableCommandName.BoardUpdated,
            table: this.name,
            recipient,
            data: { board: remapCards(this.game.board) }
        });
    }

    public sendGameRoundUpdate(recipient?: string) {
        this.commands$.next({
            name: TableCommandName.NewRound,
            table: this.name,
            recipient,
            data: { round: this.game.round }
        });
    }

    protected sendGameStarted() {
        this.commands$.next({
            name: TableCommandName.GameStarted,
            table: this.name
        });
    }

    protected sendGameEnded() {
        this.commands$.next({
            name: TableCommandName.GameEnded,
            table: this.name
        });
    }

    protected sendTableClosed() {
        this.commands$.next({
            name: TableCommandName.TableClosed,
            table: this.name
        });
    }

    sendGameStatusUpdate(recipient?: string) {
        this.commands$.next({
            name: TableCommandName.GameStatus,
            table: this.name,
            recipient,
            data: { gameStatus: this.getGameStatus() }
        });
    }

    sendDealerUpdate(recipient?: string) {
        this.commands$.next({
            name: TableCommandName.Dealer,
            table: this.name,
            recipient,
            data: { dealerPlayerID: this.dealer.id }
        });
    }

    protected sendPlayerKicked(playerName: string) {
        this.commands$.next({
            name: TableCommandName.PlayerKicked,
            table: this.name,
            data: { kickedPlayer: playerName }
        });
    }

    protected dealCards() {
        this.removePlayerCards();

        // Deal 2 cards to each player
        for (let x = 0; x < 2; x++) {
            for (const player of this.players) {
                player.cards.push(this.game.deck.pop());
            }
        }
    }

    showCards(playerID: string) {
        const player = this.getPlayer(playerID);
        if (!player) {
            throw new WsException('Not a player!');
        }

        player.showCards = true;
        this.sendPlayersUpdate();
    }

    protected getWinners(availablePlayers: Player[], everyoneElseFolded: boolean): Player[] {

        // if everyone folded, no need to rank hands
        if (everyoneElseFolded) {
            return availablePlayers;
        }

        rankPlayersHands(availablePlayers, this.game.board);

        return getHandWinners(availablePlayers);
    }

    protected mapWinners(availablePlayers: Player[], everyoneElseFolded: boolean, pot: number, potType: string): Winner[] {
        const potWinners = [...this.getWinners(availablePlayers, everyoneElseFolded)];
        const potEarning = pot / potWinners.length;
        return potWinners.map((player) => {
            return { ...player.formatWinner(), potType, amount: potEarning };
        });
    }

    protected markPlayerAFK(playerIndex: number) {
        this.players[playerIndex].afk = true;
        this.sendPlayersUpdate();
    }

    protected unmarkPlayerAFK(playerIndex: number) {
        const player = this.players[playerIndex];
        if (player.afk) {
            player.afk = false;
            player.kickVotes.clear();
        }
    }

    protected delay(id: string, cb: Function, duration: number) {
        this.stopDelay(id);

        this.timeoutHandler[id] = setTimeout(() => {
            cb();
            delete this.timeoutHandler[id];
        }, duration);
    }

    protected stopDelay(id: string) {
        if (id in this.timeoutHandler) {
            clearTimeout(this.timeoutHandler[id]);
        }
    }

}
