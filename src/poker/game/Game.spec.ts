import { Game } from './Game';

describe('Game', () => {
    let game: Game;

    beforeEach(() => {
        game = new Game('TestGame');
    });

    it('should not have a board', () => {
        expect(game.board.length).toEqual(0);
    });

    it('should fill the deck', () => {
        expect(game.deck.length).toEqual(52);
    });
});
