import { WsException } from '@nestjs/websockets';
import { SidePotPlayer, PlayerOverview, Bet, SolvedHand } from '../../shared/src';
import { remapCards, hideCards } from './utils';

export class Player {
    cards: string[] = [];
    hand: SolvedHand | null;
    bet: Bet | null = null;
    dealer = false;
    folded = false;
    allIn = false;
    hasSidePot = false;
    disconnected = false;
    afk = false;
    kickVotes: Set<string> = new Set()

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
            disconnected: player.disconnected,
            afk: player.afk,
            kickVotes: [...player.kickVotes]
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

    getAvailableChips(): number {
        if (this.bet) {
            return this.chips + this.bet.amount;
        }
        return this.chips;
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
