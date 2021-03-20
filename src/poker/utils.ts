import { Card } from '../../shared/src';

export function delay(delay: number) {
    return new Promise(resolve => setTimeout(resolve, delay));
}

export function getNextIndex(currentIndex: number, array: any[]): number {
    if (currentIndex >= array.length) {
        return 0;
    }
    return currentIndex === array.length - 1 ? 0 : currentIndex + 1;
}

export function hideCards(cards: any[]): Card[] | undefined {
    if (!cards) {
        return undefined;
    }

    return cards.map(() => {
        return { value: 0, figure: 'back' };
    });
}

export function remapCards(cards: string[]): Card[] {
    return cards.map(card => {
        const c = card.split('');
        // remap T to 10
        c[0] = c[0] === 'T' ? '10' : c[0];
        return { value: c[0], figure: c[1] };
    });
}
