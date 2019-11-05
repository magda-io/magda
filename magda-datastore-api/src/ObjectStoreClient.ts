import { Probe } from "@magda/typescript-common/dist/express/status";

export default interface ObjectStoreClient {
    getFile(name: string): NodeJS.ReadableStream;
    statusProbe: Probe;
}
