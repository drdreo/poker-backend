import { Player } from '../Player';

const Hand = require('pokersolver').Hand;

export interface SolvedHand {
    // All of the cards passed into the hand.
    cardPool: string[];

    // All of the cards involved in the identified hand type.
    cards: string[];

    // Detailed description of the identified hand type (Two Pair, A's & Q's for example).
    descr: string;

    // Type of hand identified (Two Pair for example).
    name: string;

    // Ranking of the hand type (Varies from game to game; 0 being the lowest hand).
    rank: number;
}


// export function rankHand(player: Player) {
//     player.hand = PokerEvaluator.evalHand([...player.cards, ...this.game.board]);
// }

export function rankHandNew(player: Player, board: string[]) {
    player.hand = Hand.solve([...player.cards, ...board]);
}

export function rankPlayersHands(players: Player[], board: string[]) {
    for (const player of players) {
        // only rank players still in the game
        if (!player.folded) {
            this.rankHandNew(player, board);
        }
    }
}

export function getHandWinners(players: Player[]) {
    const hands = players.map(player => player.hand);
    return Hand.winners(hands);
}
