import { OutgoingHttpHeaders } from "http";

export default interface ObjectFromStore {
    createStream(): NodeJS.ReadableStream;
    headers(): Promise<OutgoingHttpHeaders>;
}
