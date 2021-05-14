import { WsException } from '@nestjs/websockets';
import { RoundType, Winner, PokerConfig } from '../../../shared/src';
import { TableConfig } from '../../config/table.config';
import { Game } from '../game/Game';
import { BaseTable } from './BaseTable';
import { TableCommandName } from './TableCommand';


export class CoinFlipTable extends BaseTable {


    constructor(protected CONFIG: TableConfig, public name: string, protected customConfig?: PokerConfig) {
        super(CONFIG, name, customConfig);
    }

    newGame() {

        if (this.players.length < this.pokerConfig.players.min) {
            throw new WsException('Cant start game. Too less players are in.');
        }

        this.resetTable();

        this.game = new Game(`Game[${ this.name }]`);
        this.dealCards();

        this.sendPotUpdate();
        this.sendGameBoardUpdate();
        this.sendGameRoundUpdate();

        this.play();
    }

    private resetTable() {
        // make game restartable
        this.game = null;
        this.sendGameStatusUpdate();

        this.players.map(player => player.reset());
    }

    private play() {
        this.sendGameStarted();
        this.showAllPlayersCards();

        let round = this.game.round.type;
        do {
            round = this.nextRound(round);
        } while (round !== RoundType.River);

        // wait for the winner announcement. Maximum of 5s card display delay
        this.delay('announce-winner', () => {
            this.processWinners();
            this.game.end();
            this.sendGameEnded();

            this.delay('reset-table', () => {
                this.resetTable();
            }, 5000);
        }, 10000);
    }

    private processWinners() {
        const winners: Winner[] = [];
        winners.push(...this.mapWinners(this.players, false, 0, 'flip'));

        if (winners.length === 1) {
            this.logger.debug(`Player[${ winners[0].name }] has won the coin flip!`);
        } else {
            const winnerNames = winners.reduce((prev, cur) => prev + ', ' + cur.name, '');
            this.logger.debug(`Players[${ winnerNames }] won!`);
        }

        // announce winner
        this.commands$.next({
            name: TableCommandName.GameWinners,
            table: this.name,
            data: { winners }
        });
    }


}
