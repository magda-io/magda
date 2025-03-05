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
    if (!("caches" in window)) {
        // cache API is not supported
        console.log(
            "fetchWithCache: cache api is not supported. Fallback to fetch without cache"
        );
        return await fetchWithHeaders(urlOrRequest);
    }
    const cacheName = cacheCfg.cacheName || DEFAULT_CACHE_NAME;
    const expiration =
        typeof cacheCfg.expiration === "number"
            ? cacheCfg.expiration
            : DEFAULT_CACHE_EXPIRATION;
    const maxCacheSize =
        typeof cacheCfg.maxCacheSize === "number"
            ? cacheCfg.maxCacheSize
            : DEFAULT_CACHE_SIZE;
    if (expiration <= 0 || maxCacheSize <= 0) {
        return await fetchWithHeaders(urlOrRequest);
    }
    let cache: Cache;
    try {
        cache = await caches.open(cacheName);
    } catch (e) {
        // cache api might not accessible for some browser under private browsing mode
        console.log(
            "fetchWithCache: Fallback to fetch without cache due to cache API access error: " +
                e
        );
        return await fetchWithHeaders(urlOrRequest);
    }

    const url =
        typeof urlOrRequest === "string" ? urlOrRequest : urlOrRequest.url;
    const cachedResponse = await cache.match(url);

    if (cachedResponse) {
        // Manage cache based on expiration time & max cache size
        const dateHeader = cachedResponse.headers.get("Date");
        const lastModifiedHeader = cachedResponse.headers.get("Last-Modified");
        const curDate = new Date();
        let cachedTime = new Date(
            dateHeader
                ? dateHeader
                : lastModifiedHeader
                ? lastModifiedHeader
                : curDate.toUTCString()
        ).getTime();
        if (isNaN(cachedTime)) {
            cachedTime = curDate.getTime();
        }
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
    } else {
        // no existing cache entry found
        const response = await fetchWithHeaders(urlOrRequest);
        const clonedRes = response.clone();
        await cache.put(url, clonedRes);
        await enforceCacheSizeLimit(cacheName, maxCacheSize);
        return response;
    }
}

export default fetchWithCache;
