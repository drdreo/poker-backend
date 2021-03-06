import { BetType, Card, Winner, GameStatus, SidePot } from '../../../shared/src';
import { Round } from '../game/Round';

export enum TableCommandName {
    HomeInfo = 'home_info',
    GameStarted = 'game_started',
    PlayerUpdate = 'player_update',
    PlayerBet = 'player_bet',
    PlayerFolded = 'player_folded',
    MaxBetUpdate = 'max-bet_update',
    PlayersCards = 'players_cards',
    PotUpdate = 'pot_update',
    GameEnded = 'game_ended',
    GameStatus = 'game_status',
    GameWinners = 'game_winners',
    CurrentPlayer = 'current_player',
    Dealer = 'dealer',
    BoardUpdated = 'board_updated',
    NewRound = 'new_round',
    TableClosed = 'table_closed',
    PlayerKicked = 'player_kicked'
}

export interface TableCommand {
    name: TableCommandName;
    recipient?: string;
    table: string;
    data?: {
        players?;
        playerID?: string;
        currentPlayerID?: string;
        dealerPlayerID?: string;
        pot?: number;
        sidePots?: SidePot[];
        bet?: number;
        maxBet?: number;
        type?: BetType;
        board?: Card[];
        round?: Round;
        winners?: Winner[];
        gameStatus?: GameStatus;
        kickedPlayer?: string;
    };
}
