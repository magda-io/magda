import { Probe } from "magda-typescript-common/src/express/status";
import ObjectFromStore from "./ObjectFromStore";

export default interface ObjectStoreClient {
    getFile(name: string): ObjectFromStore;
    putFile(fileName: string, content: any, metaData?: object): Promise<any>;
    statusProbe: Probe;
}
