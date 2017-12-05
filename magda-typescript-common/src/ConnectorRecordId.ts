export const RecordTypeMapping = {
    "Organization": "org",
    "Dataset": "ds",
    "Distribution": "dist"
};

export default class ConnectorRecordId {
    constructor(
        readonly id: string,
        readonly type: "Organization" | "Dataset" | "Distribution",
        readonly sourceId: string) {
    }

    toString(): string {
        return [this.typeId, this.sourceId, this.id].join('-');
    }

    private get typeId(): string {
        return RecordTypeMapping[this.type];
    }
}
