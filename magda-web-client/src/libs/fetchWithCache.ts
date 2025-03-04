const DEFAULT_CACHE_NAME = "magda-default-cache";
const DEFAULT_CACHE_EXPIRATION = 18400; // 1 day
const DEFAULT_CACHE_SIZE = 10;

export interface CacheOptions {
    // -- name of the cache store to use
    cacheName?: string;
    // -- no. of seconds before cache expires
    expiration?: number;
    // -- max no. of items to store in cache
    maxCacheSize?: number;
}

function fetchWithHeaders(
    urlOrRequest: string | Request,
    headers: Record<string, string> = {}
) {
    const headerKeys = Object.keys(headers);
    if (headerKeys.length === 0) {
        return fetch(urlOrRequest);
    } else {
        const request = new Request(urlOrRequest, {
            headers: new Headers(headers)
        });
        return fetch(request);
    }
}

async function enforceCacheSizeLimit(cacheName: string, maxCacheSize: number) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    if (keys.length > maxCacheSize) {
        // cache.keys() will return the keys in the order of when they were added
        // Cache limit exceeded. Removing entries with idx 0 ~ deleteCount-1
        const deleteCount = keys.length - maxCacheSize;
        for (let i = 0; i < deleteCount; i++) {
            await cache.delete(keys[i]);
        }
    }
}

async function fetchWithCache(
    urlOrRequest: string | Request,
    cacheCfg: CacheOptions = {}
): Promise<Response> {
    const cacheName = cacheCfg.cacheName || DEFAULT_CACHE_NAME;
    const expiration = cacheCfg.expiration || DEFAULT_CACHE_EXPIRATION;
    const maxCacheSize = cacheCfg.maxCacheSize || DEFAULT_CACHE_SIZE;
    const cache = await caches.open(cacheName);
    const url =
        typeof urlOrRequest === "string" ? urlOrRequest : urlOrRequest.url;
    const cachedResponse = await cache.match(url);

    if (cachedResponse) {
        const etag = cachedResponse.headers.get("ETag");
        let lastModified = cachedResponse.headers.get("Last-Modified");
        if (!lastModified) {
            lastModified = cachedResponse.headers.get("Date");
        }
        if (etag) {
            // even when the server supports ETag, we might not have it as the CORS fetch response doesn't expose ETag header
            // Send conditional request using ETag & optional Last-Modified (only when it's available)
            const response = await fetchWithHeaders(urlOrRequest, {
                "If-None-Match": etag,
                ...(lastModified ? { "If-Modified-Since": lastModified } : {})
            });

            if (response.status === 304) {
                // Cache is still valid, serving cached version
                return cachedResponse;
            } else {
                // Cache expired, updating...
                await cache.put(url, response.clone());
                await enforceCacheSizeLimit(cacheName, maxCacheSize);
                return response;
            }
        } else {
            // Server doesn't support ETag header (or the header is not accessible via fetch),
            // we will manage cache based on expiration time & max cache size
            const curDate = new Date();
            const cachedTime = new Date(
                lastModified || curDate.toUTCString()
            ).getTime();
            const currentTime = curDate.getTime();
            if (currentTime - cachedTime > expiration * 1000) {
                // Cache expired, updating...
                const response = await fetchWithHeaders(urlOrRequest);
                await cache.put(url, response.clone());
                await enforceCacheSizeLimit(cacheName, maxCacheSize);
                return response;
            } else {
                // Cache is still valid, serving cached version
                return cachedResponse;
            }
        }
    } else {
        // no existing cache entry found
        const response = await fetchWithHeaders(urlOrRequest);
        await cache.put(url, response.clone());
        await enforceCacheSizeLimit(cacheName, maxCacheSize);
        return response;
    }
}

export default fetchWithCache;
