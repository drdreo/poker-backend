// RoundTypes: Deal,Flop,Turn,River,Showdown
// BetTypes: Bet,Raise,ReRaise, cap
import { RoundType } from '../../../shared/src';
import { Bet } from './Bet';

export class Round {
    bets: Bet[] = [];

    constructor(public type: RoundType) { }
}
