export type StorageBucketMetaData = {
    region?: string;
    ownerId?: string;
    orgUnitId?: string;
};

export type StorageObjectMetaData = {
    size?: number;
    ownerId?: string;
    orgUnitId?: string;
    recordId?: string;
    contentType?: string;
    contentEncoding?: string;
    cacheControl?: string;
};
