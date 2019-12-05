import { Probe } from "@magda/typescript-common/dist/express/status";
import ObjectFromStore from "./ObjectFromStore";

export default interface ObjectStoreClient {
    getFile(name: string): ObjectFromStore;
    postFile(fileName: string, content: any, metaData?: object): Promise<any>;
    statusProbe: Probe;
}
