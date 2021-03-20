import { BetType } from '@shared/src';

export class Bet {
    constructor(public amount: number, public type: BetType) {}
}
