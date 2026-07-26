export function encodeKey(key: string): string {
    return key
        .split("/")
        .map((seg) => encodeURIComponent(seg))
        .join("/");
}

export const WHOAMI = "/v0/auth/users/whoami";
export const SEARCH_DATASETS = "/v0/search/datasets";
export const SEMANTIC_SEARCH = "/v0/semantic-search/search";
export const REGISTRY_RECORDS = "/v0/registry/records";
export const REGISTRY_ASPECTS = "/v0/registry/aspects";

export const registryRecord = (id: string) =>
    `${REGISTRY_RECORDS}/${encodeURIComponent(id)}`;

// Returns the record with ALL attached aspect data (including custom aspects),
// filtered by the caller's read permission server-side.
export const registryRecordInFull = (id: string) =>
    `${REGISTRY_RECORDS}/inFull/${encodeURIComponent(id)}`;

export const recordAspect = (recordId: string, aspectId: string) =>
    `${registryRecord(recordId)}/aspects/${encodeURIComponent(aspectId)}`;

// Bulk endpoint: set one aspect's data across a list of records in a single
// (transactional) request. Body: { recordIds, data }; use ?merge=true to
// deep-merge into existing aspect data instead of replacing it.
export const recordsAspect = (aspectId: string) =>
    `${REGISTRY_RECORDS}/aspects/${encodeURIComponent(aspectId)}`;

export const registryAspect = (id: string) =>
    `${REGISTRY_ASPECTS}/${encodeURIComponent(id)}`;

export const storageObject = (bucket: string, key: string) =>
    `/v0/storage/${encodeURIComponent(bucket)}/${encodeKey(key)}`;

export const storageUpload = (bucket: string, keyPrefix: string) =>
    `/v0/storage/upload/${encodeURIComponent(bucket)}` +
    (keyPrefix ? `/${encodeKey(keyPrefix)}` : "");

const multipart = (op: string) => (bucket: string, key: string) =>
    `/v0/storage/multipart/${op}/${encodeURIComponent(bucket)}/${encodeKey(
        key
    )}`;

export const multipartInitiate = multipart("initiate");
export const multipartPart = multipart("part");
export const multipartParts = multipart("parts");
export const multipartComplete = multipart("complete");
export const multipartAbort = multipart("abort");
