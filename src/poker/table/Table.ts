import { WsException } from '@nestjs/websockets';
import { BetType, RoundType, SidePot, Winner, SidePotPlayer, PokerConfig } from '../../../shared/src';
import { TableConfig } from '../../config/table.config';
import { Bet } from '../game/Bet';
import { Game } from '../game/Game';
import { Player } from '../Player';
import { getNextIndex } from '../utils';
import { BaseTable } from './BaseTable';
import { TableCommandName } from './TableCommand';


export class Table extends BaseTable {

    currentPlayer: number; // index of the current player

    constructor(protected CONFIG: TableConfig, public name: string, protected customConfig?: PokerConfig) {
        super(CONFIG, name, customConfig);
    }

    getCurrentPlayer(): Player {
        return this.players[this.currentPlayer];
    }

    private isCurrentPlayer(playerID: string) {
        return this.getCurrentPlayer().id === playerID;
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

    private setStartPlayer() {

        // heads up rules, dealer is SB and acts first
        const headsUp = this.players.length === 2;

        // just hardcoded dealer is always last and small blind is first
        // check if dealer was set already, so move it further instead
        if (this.dealer) {
            let dealerIndex = this.getPlayerIndexByID(this.dealer.id);
            this.moveDealer(dealerIndex);
            dealerIndex = this.getPlayerIndexByID(this.dealer.id);
            this.currentPlayer = headsUp ? dealerIndex : getNextIndex(dealerIndex, this.players);
        } else {
            this.setDealer(this.players[this.players.length - 1]);
            const dealerIndex = this.getPlayerIndexByID(this.dealer.id);
            this.currentPlayer = headsUp ? dealerIndex : 0;
        }

        this.sendCurrentPlayer();
        this.sendDealerUpdate();
        this.triggerAFKDetection();
    }

    moveDealer(dealerIndex: number) {
        this.setDealer(this.players[getNextIndex(dealerIndex, this.players)]);
    }

    /***
     * Player Turn logic:

     first after dealer starts
     - if bet was not called by everyone, next player who did not fold


     Heads Up (1vs1):
     - dealer is small blind

     */
    private nextPlayer(sendUpdate = true) {
        let maxTries = 0;

        do {
            if (maxTries++ > this.players.length) {
                throw Error('Infinity loop detected in nextPlayer()');
            }

            // if last player, continue with first
            this.currentPlayer = this.currentPlayer >= this.players.length - 1 ? 0 : this.currentPlayer + 1;
        } while (this.players[this.currentPlayer].folded || this.players[this.currentPlayer].allIn);

        if (sendUpdate) {
            this.sendCurrentPlayer();
            this.triggerAFKDetection();
        }
    }

    sendCurrentPlayer(recipient?: string) {
        const currentPlayer = this.players[this.currentPlayer];
        if (currentPlayer) {
            this.commands$.next({
                name: TableCommandName.CurrentPlayer,
                table: this.name,
                recipient,
                data: { currentPlayerID: currentPlayer.id }
            });
        } else {
            this.logger.warn('No current player set.');
        }

    }

    newGame() {

        if (this.players.length < this.pokerConfig.players.min) {
            throw new WsException('Cant start game. Too less players are in.');
        }

        this.removePoorPlayers();

        // check if we removed everyone but the winner due to money issue
        if (this.players.length === 1) {
            if (this.pokerConfig.table.autoClose) {
                this.sendTableClosed();
            } else {
                // make game restartable
                this.game = null;
                this.sendGameStatusUpdate();
            }

            return;
        }

        this.players.map(player => player.reset());
        this.setStartPlayer();

        this.game = new Game(`Game[${ this.name }]`);
        this.dealCards();

        this.sendPotUpdate();
        this.sendGameBoardUpdate();
        this.sendGameRoundUpdate();
        this.sendGameStarted();

        // auto bet small & big blind
        this.bet(this.players[this.currentPlayer].id, this.pokerConfig.blinds.small, BetType.SmallBlind);
        this.bet(this.players[this.currentPlayer].id, this.pokerConfig.blinds.big, BetType.BigBlind);
    }

    call(playerID: string) {
        const playerIndex = this.getPlayerIndexByID(playerID);
        if (playerIndex !== this.currentPlayer) {
            throw new WsException('Not your turn!');
        }
        const player = this.players[playerIndex];
        const maxBet = this.game.getMaxBet();

        if (!maxBet) {
            throw new WsException(`Can't call. No bet to call.`);
        }

        const availableChips = player.getAvailableChips();
        const betToPay = maxBet > availableChips ? availableChips : maxBet;
        this.bet(playerID, betToPay, BetType.Call);
    }

    bet(playerID: string, bet: number, betType: BetType = BetType.Bet) {

        const userAction = betType !== BetType.SmallBlind && betType !== BetType.BigBlind;

        const playerIndex = this.getPlayerIndexByID(playerID);
        if (playerIndex !== this.currentPlayer) {
            throw new WsException('Not your turn!');
        }

        const player = this.players[playerIndex];
        this.logger.debug(`Player[${ player.name }] bet[${ betType }][${ bet }]!`);

        // Check if bet was at allowed by min raise, but let call bets still proceed
        if (betType === BetType.Bet || betType === BetType.Raise) {
            const maxBet = this.game.getMaxBet();
            const minRaise = this.pokerConfig.blinds.big; // TODO: Check if min raise is big blind or the current max bet
            if (bet < maxBet + minRaise && bet != player.chips) {
                throw new WsException('Can not bet less than max bet!');
            }
        }

        const existingBet = player.bet;
        if (existingBet) {
            player.chips += player.bet.amount;
        }

        player.pay(bet);
        // check if all-in
        if (player.chips <= 0) {
            player.allIn = true;
            betType = BetType.AllIn;
            this.logger.debug(player.name + ' went all-in!');
        }

        const playerBet = new Bet(bet, betType);
        player.bet = playerBet;

        this.game.bet(playerIndex, playerBet);

        this.sendPlayerBet(playerID, bet, betType);

        const next = this.progress(userAction);
        if (next) {
            this.nextPlayer(userAction);
            if (userAction) {
                this.sendPlayersUpdate();
            }
        }
    }

    fold(playerID: string, userAction = true) {
        const playerIndex = this.getPlayerIndexByID(playerID);
        if (playerIndex !== this.currentPlayer) {
            throw new WsException('Not your turn!');
        }

        const player = this.players[playerIndex];
        this.logger.debug(`Player[${ player.name }] folded!`);

        player.folded = true;

        const next = this.progress(userAction);
        if (next) {
            this.nextPlayer();
        }
        this.sendPlayersUpdate();
        this.sendPlayerFold(playerID);
    }

    check(playerID: string) {
        const playerIndex = this.getPlayerIndexByID(playerID);
        if (playerIndex !== this.currentPlayer) {
            throw new WsException('Not your turn!');
        }
        this.logger.debug(`Player[${ playerID }] checked!`);

        this.game.check(playerIndex);

        const next = this.progress();
        if (next) {
            this.nextPlayer();
            this.sendPlayersUpdate();
        }
    }

    voteKick(playerID: string, kickPlayerID: string) {
        if (playerID === kickPlayerID) {
            throw new WsException('Stop kicking yourself!');
        }

        const votesNeeded = Math.max(Math.round(this.players.length / 2), 2);
        const kickPlayer = this.getPlayer(kickPlayerID);
        if (kickPlayer.afk) {
            kickPlayer.kickVotes.add(playerID);
            if (kickPlayer.kickVotes.size >= votesNeeded) {
                this.kickPlayer(kickPlayer);
            }
        } else {
            this.logger.warn('Can not kick player who is not AFK!');
        }

    }

    private kickPlayer(kickPlayer: Player) {
        this.logger.log(`Kicking player ${ kickPlayer.name }`);

        this.sendPlayerKicked(kickPlayer.name);
        const wasCurrentPlayer = this.isCurrentPlayer(kickPlayer.id);
        const wasLastPlayer = this.currentPlayer === this.players.length - 1;
        const wasDealer = kickPlayer.id === this.dealer.id;
        const kickedPlayerIndex = this.getPlayerIndexByID(kickPlayer.id);
        if (wasDealer) {
            this.moveDealer(kickedPlayerIndex);
        }
        this.removePlayer(kickPlayer);

        // clean up bets as well, TODO: check sidepots
        this.game.removeBet(kickedPlayerIndex);

        const next = this.progress(false);
        if (next) {
            if (wasCurrentPlayer) {
                // rewrite current player so it works with nextPlayer() , first --> last, others --> previous
                if (this.currentPlayer === 0) {
                    this.currentPlayer = this.players.length - 1;
                } else {
                    this.currentPlayer = this.currentPlayer - 1;
                }
                this.nextPlayer();
            } else if (wasLastPlayer) {
                this.logger.warn('kickPlayer wasn\'t  triggered on the current player!');
                this.currentPlayer = this.currentPlayer - 1;
            }
        }

        this.sendPlayersUpdate();
    }

    private isEndOfRound(): boolean {
        let endOfRound = true;
        const maxBet = this.game.getMaxBet();
        // check if each player has folded, called or is all-in
        for (let i = 0; i < this.players.length; i++) {
            if (this.players[i].folded === false && !this.players[i].allIn) {
                const playersBet = this.game.getBet(i);
                if (playersBet?.amount !== maxBet || playersBet.type === BetType.BigBlind) { // if other players just call the BB, give the BB an option as well
                    endOfRound = false;
                    break;
                }
            }
        }
        return endOfRound;
    }

    private progress(userAction = true): boolean {
        // every action ends up here, so check if the player returned from AFK
        if (userAction) {
            this.unmarkPlayerAFK(this.currentPlayer);
        }

        const everyoneElseFolded = this.hasEveryoneElseFolded();

        if (this.isEndOfRound() || everyoneElseFolded) {
            let round = this.game.round.type;
            this.logger.debug(`Round[${ round }] ended!`);

            this.processBets(everyoneElseFolded);

            // all players all in or all except one is all in
            const allInPlayers = this.players.filter(player => player.allIn);
            if (!everyoneElseFolded && allInPlayers.length != 0 && allInPlayers.length >= this.getActivePlayers().length - 1) {
                this.logger.debug('All in situation, auto-play game');
                this.showAllPlayersCards();

                // play until RoundType.River
                do {
                    round = this.nextRound(round);
                } while (round !== RoundType.River);
            }

            // if we are in the last round and everyone has either called or folded
            if (round === RoundType.River || everyoneElseFolded) {
                this.game.end();
                this.sendGameEnded();
                this.stopAFKDetection();

                // only show cards if it was the last betting round
                if (round === RoundType.River) {
                    this.showAllPlayersCards(); // showing cards twice if all-in situation
                }

                const endGameDelay = everyoneElseFolded ? 2000 : this.CONFIG.END_GAME_DELAY;
                // wait for the winner announcement. Maximum of 5s card display delay
                this.delay('announce-winner', () => {
                    this.processWinners(everyoneElseFolded);
                    // hide pot after giving it to the winner
                    this.game.resetPots();
                    this.sendPotUpdate();

                    // auto-create new game
                    this.delay('new-game', () => {
                        this.newGame();
                    }, this.CONFIG.NEXT_GAME_DELAY);
                }, endGameDelay);

                // stop the game progress since we are done
                return false;
            }

            this.nextRound(round);
            this.sendGameRoundUpdate();
            // End of Round: always let player after dealer start, so set it to the dealer
            this.currentPlayer = this.getPlayerIndexByID(this.dealer.id);
        }
        return true;
    }

    private processBets(everyoneElseFolded = false) {
        let activePlayers = this.players.filter(player => player.bet?.amount > 0 || !player.folded && player.allIn && !player.hasSidePot);
        const allInPlayers = activePlayers.filter(player => player.allIn);

        // handle split pots if someone went all-in, and a player raised or bet
        const allinBets = allInPlayers.reduce((bets, player) => {
            const idx = this.getPlayerIndexByID(player.id);
            const bet = this.game.getBetAmount(idx);
            bets.push(bet);
            return bets;
        }, [] as number[]);

        const maxBet = this.game.getMaxBet();
        const raised = allinBets.some(bet => bet < maxBet);
        const allInButNoBet = allinBets.some(bet => !bet);
        // if the all-in bet is maxBet
        if (maxBet && allInButNoBet) {
            this.game.createSidePot(activePlayers);
        }

        if (allInPlayers.length > 0 && raised) {
            this.logger.debug('Creating new side pot cause someone went all in!');

            let potPlayers = [];
            do {
                const lowestBet = this.game.getLowestBet();
                let pot = 0;
                for (let i = 0; i < this.players.length; i++) {
                    const player = this.players[i];

                    if (player.bet?.amount > 0) {
                        pot += lowestBet;
                        player.bet.amount -= lowestBet;
                        this.game.bet(i, player.bet);
                        potPlayers.push(player);
                    }
                }

                this.game.pot += pot;

                activePlayers = this.players.filter(player => player.bet?.amount > 0);
                if (activePlayers.length > 1) {
                    this.game.createSidePot(potPlayers);
                    potPlayers = [];
                }
            } while (activePlayers.length > 1);

            // if there is money left, give it back
            const leftOvers = this.game.getLastBet();
            if (leftOvers) {
                this.players[leftOvers.index].chips += leftOvers.bet;
            }

        } else {
            // if everyone else folded, repay the last bet if it existed
            if (everyoneElseFolded) {
                const lastPlayer = this.getActivePlayers()[0];
                const lastPlayerIndex = this.getPlayerIndexByID(lastPlayer.id);
                const lastPlayersBet = this.game.getBet(lastPlayerIndex);
                if (lastPlayersBet) {
                    lastPlayer.chips += lastPlayersBet.amount;
                    this.game.betNewBet(lastPlayerIndex, 0, lastPlayersBet.type);
                }
            }
            this.game.moveBetsToPot();
        }

        this.resetPlayerBets();
        this.game.round.bets = [];
        this.sendPotUpdate();
    }

    private processWinners(everyoneElseFolded: boolean) {

        const availablePlayers = this.players.filter(player => !player.folded && !player.hasSidePot);

        const mainPot = this.game.pot;
        const winners: Winner[] = [];
        winners.push(...this.mapWinners(availablePlayers, everyoneElseFolded, mainPot, 'main'));

        // if there were side pots, process the winners of each
        for (let i = 0; i < this.game.sidePots.length; i++) {
            const sidePot = this.game.sidePots[i];
            const potPlayers = sidePot.players.filter(player => !player.folded); // remove folded players
            winners.push(...this.mapWinners(potPlayers, everyoneElseFolded, sidePot.amount, 'sidepot' + i));
        }

        if (winners.length === 1) {
            this.logger.debug(`Player[${ winners[0].name }] has won the game and receives ${ winners[0].amount }!`);
        } else {
            const winnerNames = winners.reduce((prev, cur) => prev + ', ' + cur.name, '');
            this.logger.debug(`Players[${ winnerNames }] won!`);
        }

        // pay the winners
        for (const winner of winners) {
            this.getPlayer(winner.id).chips += winner.amount;
        }

        // announce winner
        this.commands$.next({
            name: TableCommandName.GameWinners,
            table: this.name,
            data: { winners }
        });
    }

    private removePoorPlayers() {
        let dealerIndex;
        this.players = this.players.filter(player => {
            if (player.chips > this.pokerConfig.blinds.big) {
                return true;
            }
            this.logger.verbose(`Removing player[${ player.name }] from the table because chips[${ player.chips }] are not enough[${ this.pokerConfig.blinds.big }].`);
            if (player.dealer) {
                dealerIndex = this.getPlayerIndexByID(player.id);
            }
            return false;
        });

        if (dealerIndex) {
            this.moveDealer(dealerIndex);
        }
        this.sendPlayersUpdate();
    }

    /**
     * Will mark the current player as AFK after a delay.
     * Started on new game, and on next player.
     * Stopped when game ended.
     */
    private triggerAFKDetection() {
        if (this.pokerConfig.turn.time > 1) {
            this.delay('mark-inactive', () => {
                const currentPlayer = this.players[this.currentPlayer];
                this.logger.log(`Detected inactive player[${ currentPlayer.name }]!`);

                this.fold(currentPlayer.id, false);
            }, this.pokerConfig.turn.time * 1000 + 2000);
        }

        this.delay('mark-afk', () => {
            this.logger.log(`Detected AFK: player[${ this.players[this.currentPlayer].name }]!`);

            this.markPlayerAFK(this.currentPlayer);
        }, this.CONFIG.AFK_DELAY);
    }

    private stopAFKDetection() {
        this.stopDelay('mark-afk');
    }
}
