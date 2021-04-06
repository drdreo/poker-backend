import { Card } from '../../shared/src';

export function delay(delay: number) {
    return new Promise(resolve => setTimeout(resolve, delay));
}

export function getNextIndex(currentIndex: number, array: any[]): number {
    return currentIndex >= array.length - 1 ? 0 : currentIndex + 1;
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


export function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

export default function mergeDeep(target: any, source: any) {
    const output = Object.assign({}, target);
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target))
                    Object.assign(output, { [key]: source[key] });
                else
                    output[key] = mergeDeep(target[key], source[key]);
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}
export const iterate = (obj, cb) => {
    Object.keys(obj).forEach(key => {

        obj[key] = cb(obj[key]);
        if (typeof obj[key] === 'object') {
            iterate(obj[key], cb);
        }
    });
};
