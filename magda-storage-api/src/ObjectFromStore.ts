import { OutgoingHttpHeaders } from "http";
import Stream from "stream";

export default interface ObjectFromStore {
    createStream(): Promise<Stream>;
    headers(): Promise<OutgoingHttpHeaders>;
}
