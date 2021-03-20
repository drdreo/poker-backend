import { Player } from '../Player';

export const Hand = require('pokersolver').Hand;

// export function rankHand(player: Player) {
//     player.hand = PokerEvaluator.evalHand([...player.cards, ...this.game.board]);
// }

export function rankHandNew(player: Player, board: string[]) {
    player.hand = Hand.solve([...player.cards, ...board]);
    player.hand.playerID = player.id;
}

export function rankPlayersHands(players: Player[], board: string[]) {
    for (const player of players) {
        // only rank players still in the game
        if (!player.folded) {
            this.rankHandNew(player, board);
        }
    }
}

export function getHandWinners(players: Player[]): Player[] {

    // const winner = players.reduce((prev, cur) => {
    //     return (prev.hand?.rank > cur.hand?.rank) ? prev : cur;
    // });

    // then return all players with that hand
    const hands = players.map(player => player.hand);
    const winnningHands = Hand.winners(hands);
    return players.filter(player => winnningHands.some(hand => hand.playerID === player.id));
}
