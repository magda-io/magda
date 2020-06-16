import ObjectFromStore from "./ObjectFromStore";

export type CreateBucketResponse = {
    message: string;
    err?: Error;
    success: boolean;
};

/**
 * Generic interface for manipulating object stores - e.g. S3, Minio, Google Storage.
 */
export default interface ObjectStoreClient {
    /**
     * Creates a new bucket in the store.
     *
     * @param bucket The bucket name
     * @param region The region to create the bucket in - this
     *  will fall back to the default region if not specified.
     */
    createBucket(
        bucket: string,
        region?: string
    ): Promise<CreateBucketResponse>;

    /**
     * Get a file from the store.
     *
     * @param bucket The name of the bucket containing the file
     * @param name The file name
     */
    getFile(bucket: string, name: string): ObjectFromStore;

    /**
     * Add a new file to the specified bucket.
     *
     * @param bucket The bucket to put the file in
     * @param fileName The name of the new file
     * @param content The content of the file
     * @param metaData Any metadata to add to the file.
     */
    putFile(
        bucket: string,
        fileName: string,
        content: any,
        metaData?: object
    ): Promise<void>;

    /**
     * Delete a file in the specified bucket.
     *
     * @param bucket The bucket name
     * @param name The name of the file
     */
    deleteFile(bucket: string, name: string): Promise<boolean>;
}
