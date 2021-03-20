import { Player } from '../Player';

const Hand = require('pokersolver').Hand;

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
