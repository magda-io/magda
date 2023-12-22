import ConnectorRecordId from "./ConnectorRecordId.js";

export default class RecordCreationFailure {
    constructor(
        readonly id: ConnectorRecordId,
        readonly parentId: ConnectorRecordId,
        readonly error: Error
    ) {}
}
