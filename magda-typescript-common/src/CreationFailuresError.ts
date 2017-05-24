import CreationFailure from './CreationFailure';

export default class CreationFailuresError extends Error {
    constructor(readonly failures: CreationFailure[]) {
        super('One or more aspect definitions could not be created.');
    }
}
