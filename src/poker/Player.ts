import { WsException } from '@nestjs/websockets';
import { SidePotPlayer, PlayerOverview, Bet } from '../../shared/src';
import { SolvedHand } from './game/Hand';
import { remapCards, hideCards } from './utils';

export class Player {
    cards: string[] = [];
    hand: SolvedHand | null;
    bet: Bet | null = null;
    folded = false;
    allIn = false;
    hasSidePot = false;
    disconnected = false;

    constructor(public id: string, public name: string, public color: string, public chips: number) {
    }

    static getPlayerOverview(player: Player, showCards: boolean): PlayerOverview {
        return {
            id: player.id,
            name: player.name,
            chips: player.chips,
            bet: player.bet,
            cards: showCards && !player.folded ? remapCards(player.cards) : hideCards(player.cards),
            allIn: player.allIn,
            folded: player.folded,
            color: player.color,
            disconnected: player.disconnected
        };
    }

    static getSidePotPlayer(player: Player): SidePotPlayer {
        return {
            allIn: player.allIn,
            color: player.color,
            id: player.id,
            name: player.name
        };
    }

    reset() {
        this.folded = false;
        this.allIn = false;
        this.hasSidePot = false;
        this.hand = null;
        this.cards = [];
        this.bet = null;
    }

    pay(bet: number) {
        if (this.chips - bet < 0) {
            throw new WsException(`Not sufficient funds to bet[${ bet }]!`);
        }
        this.chips -= bet;
    }

    formatWinner() {
        return {
            id: this.id,
            name: this.name,
            allIn: this.allIn,
            hand: this.hand
        };
    }

}
