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

/**
 * The canonical storage object metadata key that records the object owner's user id.
 * `storage/object/*` auth decisions read `storage.object.ownerId` from this key.
 */
export const OBJECT_OWNER_ID_META_KEY = "magda-owner-id";

/**
 * Storage API versions before v7.1.0 recorded the uploader under this key instead.
 * It's only read (never written) so objects uploaded by those versions keep their owner.
 */
export const LEGACY_OBJECT_OWNER_ID_META_KEY = "magda-user-id";

/**
 * Retrieve the owner's user id from storage object metadata (e.g. `statObject().metaData`).
 * The canonical key takes precedence over the legacy key when both are present.
 */
export function getObjectOwnerId(
    metaData?: Record<string, any> | null
): string | undefined {
    const ownerId = metaData?.[OBJECT_OWNER_ID_META_KEY];
    if (typeof ownerId === "string" && ownerId) {
        return ownerId;
    }
    const legacyOwnerId = metaData?.[LEGACY_OBJECT_OWNER_ID_META_KEY];
    if (typeof legacyOwnerId === "string" && legacyOwnerId) {
        return legacyOwnerId;
    }
    return undefined;
}
