import { Player } from '../Player';
import { Hand, rankPlayersHands, getHandWinners } from './Hand';

describe('Hand', () => {

    let player1;
    let player2;
    let player3;
    let board;
    beforeEach(() => {
        board = ['3H', '4H', '5C', '7C', 'JS'];
        player1 = new Player('1', 'testPlayer1', 'white', 1000);
        player2 = new Player('2', 'testPlayer2', 'white', 1000);
        player3 = new Player('3', 'testPlayer3', 'white', 1000);
        player1.cards = ['7D', '2H'];
        player2.cards = ['10D', '10S'];
        player3.cards = ['AS', 'AD'];
    });

    it('should detect the higher pair to win', function () {
        const board = ['3H', '4H', '5C', '7C', 'JS'];
        const h1 = Hand.solve([...board, '7D', '2H']);
        const h2 = Hand.solve([...board, '10D', '10S']);
        const h3 = Hand.solve([...board, 'AS', 'AD']);
        const hands = [h1, h2, h3];
        const winners = Hand.winners(hands);
        expect(winners.length).toBe(1);
    });

    it('should rank the players cards', () => {
        expect(player1.hand).toBeUndefined();
        expect(player2.hand).toBeUndefined();
        expect(player3.hand).toBeUndefined();

        const players = [player1, player2, player3];
        rankPlayersHands(players, board);

        expect(player1.hand).toBeDefined();
        expect(player2.hand).toBeDefined();
        expect(player3.hand).toBeDefined();
    });

    it('should detect the player with the higher pair to win', () => {
        expect(player1.hand).toBeUndefined();
        const players = [player1, player2, player3];
        rankPlayersHands(players, board);
        const winners = getHandWinners(players);

        expect(player1.hand.name).toBe('Pair');
        expect(winners.length).toBe(1);
        expect(winners[0].id).toBe(player3.id);
    });

    it('should set the playerID on the hand', () => {
        expect(player1.hand).toBeUndefined();
        const players = [player1, player2, player3];
        rankPlayersHands(players, board);
        const winners = getHandWinners(players);

        expect(player1.hand.descr).toBe('Pair, 7\'s');
        expect(winners.length).toBe(1);
    });
});
