import ObjectFromStore from "./ObjectFromStore";

export default interface ObjectStoreClient {
    getFile(bucket: string, name: string): ObjectFromStore;
    putFile(
        bucket: string,
        fileName: string,
        content: any,
        metaData?: object
    ): Promise<any>;
    deleteFile(bucket: string, name: string): Promise<boolean>;
}
