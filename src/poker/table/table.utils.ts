export class InvalidConfigError extends Error {

}

export class GameStartedError extends Error {
    name = 'GameStarted';
}

export class TableFullError extends Error {
    name = 'TableFull';
}

export function validateConfig(config: any): boolean {
    const testingConfig = { ...config };
    if (typeof testingConfig.spectatorsAllowed != 'boolean') {
        return false;
    }
    if (typeof testingConfig.isPublic != 'boolean') {
        return false;
    }
    if (typeof testingConfig.music != 'boolean') {
        return false;
    }
    if (isNaN(testingConfig.turn.time)) {
        return false;
    }
    if (isNaN(testingConfig.chips) || testingConfig.chips < 0) {
        return false;
    }
    if (isNaN(testingConfig.blinds.small) || testingConfig.blinds.small < 0) {
        return false;
    }
    if (isNaN(testingConfig.blinds.big)) {
        return false;
    }
    if (testingConfig.blinds.big <= testingConfig.blinds.small) {
        return false;
    }
    if (isNaN(testingConfig.blinds.duration)) {
        return false;
    }
    if (isNaN(testingConfig.afk.delay)) {
        return false;
    }
    if (isNaN(testingConfig.players.min) || testingConfig.players.min < 2) {
        return false;
    }
    if (isNaN(testingConfig.players.max) || testingConfig.players.max < 2) {
        return false;
    }
    if (testingConfig.players.max < testingConfig.players.min) {
        return false;
    }
    if (typeof testingConfig.table.autoClose != 'boolean') {
        return false;
    }
    if (typeof testingConfig.table.rebuy != 'boolean') {
        return false;
    }
    return true;
}

