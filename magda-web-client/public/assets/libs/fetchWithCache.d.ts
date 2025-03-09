interface CacheOptions {
    cacheName?: string;
    expiration?: number;
    maxCacheSize?: number;
}
declare global {
    function fetchWithCache(
        urlOrRequest: string | Request,
        cacheCfg?: CacheOptions
    ): Promise<Response>;
    interface Window {
      fetchWithCache: (
        urlOrRequest: string | Request,
        cacheCfg?: CacheOptions
      ) => Promise<Response>;
    }
  }
  