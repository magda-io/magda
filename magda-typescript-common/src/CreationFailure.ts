export default class CreationFailure {
    constructor(readonly id: string, readonly parentId: string, readonly error: Error) {}
}
