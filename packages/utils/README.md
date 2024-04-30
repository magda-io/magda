### MAGDA Common Utils

This package includes the following common utilities that may help magda miniors / connectors development:

```typescript
/**
 * Checks to see whether the passed argv has a jwtSecret object. If not,
 * tries to add one by looking at the JWT_SECRET env var and failing that,
 * the jwtSecret value in package.json config.
 *
 * If it can't find one and required is true (or unprovided), this will
 * throw an Error.
 */
export declare function addJwtSecretFromEnvVar<T>(
  argv: {
    [key in keyof Arguments<T>]: Arguments<T>[key];
  },
  required?: boolean
): {
  [key in keyof Arguments<T>]: Arguments<T>[key];
};

export declare function arrayToMaybe<T>(rows: T[]): Maybe<T>;

export declare class AsyncPage<T> {
  readonly requestNextPage: CreateAsyncPage<T>;
  readonly data: T;
  readonly hasData: boolean;
  static create<T>(next: (data: T) => Promise<T>): AsyncPage<T>;
  static single<T>(value: T): AsyncPage<T>;
  static singlePromise<T>(valuePromise: Promise<T>): AsyncPage<T>;
  static none<T>(): AsyncPage<T>;
  constructor(data: T, hasData: boolean, requestNextPage: CreateAsyncPage<T>);
  map<TResult>(selector: (data: T) => TResult): AsyncPage<TResult>;
  forEach(callback: (data: T) => void): Promise<void>;
  take(n: number): AsyncPage<T>;
}

export declare function asyncPageToArray<T>(page: AsyncPage<T[]>): Promise<T[]>;

export declare class BadRequestError extends ServiceError {
  constructor(statusCode: number, errorResponse: ApiError, e: any);
}

export declare function buildJwt(
  jwtSecret: string,
  userId: string,
  session?: any
): string;

export declare const coerceJson: (
  param: string
) => (json?: string | object | any[]) => any;

declare interface CreateAsyncPage<T> {
  (): Promise<AsyncPage<T>>;
}

export declare function createNoCacheFetchOptions(
  fetchOptions?: RequestInit
): {
  body?: BodyInit;
  cache?: RequestCache;
  credentials?: RequestCredentials;
  headers?: HeadersInit;
  integrity?: string;
  keepalive?: boolean;
  method?: string;
  mode?: RequestMode;
  redirect?: RequestRedirect;
  referrer?: string;
  referrerPolicy?: ReferrerPolicy;
  signal?: AbortSignal;
  window?: null;
};

/**
 * Creates a {@link ServiceError} from the result of a failed call to an API generated
 * by swagger-codegen.  The result typically includes `response` (with a status code) and
 * a `body` (the JSON the server returned with the error), but may be other things if,
 * e.g., an exception occurred while attempting to invoke the service.
 *
 * @export
 * @param {*} e The result of the failed call.
 * @returns {Error} An Error created from the failed result.
 */
export declare function createServiceError(e: any): Error;

export declare function encodeURIComponentWithApost(string: string): string;

export declare function fetchRequest<T = any, CT = string>(
  method: string,
  url: string,
  body?: any,
  contentType?: CT | RequestContentType | undefined | null,
  returnHeaders?: false,
  extraRequestOptions?: RequestInit
): Promise<T>;

export declare function fetchRequest<T = any, CT = string>(
  method: string,
  url: string,
  body?: any,
  contentType?: CT | RequestContentType | undefined | null,
  returnHeaders?: true,
  extraRequestOptions?: RequestInit
): Promise<[T, Headers]>;

export declare function forEachAsync<T>(
  page: AsyncPage<T[]>,
  maxConcurrency: number,
  callbackFn: (data: T) => Promise<void>
): Promise<void>;

export declare function formatServiceError(
  baseMessage: string,
  e: any,
  retriesLeft: number
): string;

export declare function getMinikubeIP(): string;

/**
 * Get the access url of a storage api resource from [pseudo storage api resource URL](https://github.com/magda-io/magda/issues/3000)
 * If the input url is not a pseudo storage api resource URL, return the input url directly
 *
 * @export
 * @param {string} resourceUrl pseudo storage api resource URL or ordinary HTTP access url
 * @param {string} storageApiBaseUrl storage api base url
 * @param {string} datasetsBucket datasets storage bucket name
 * @return {*}
 */
export declare function getStorageApiResourceAccessUrl(
  resourceUrl: string,
  storageApiBaseUrl: string,
  datasetsBucket: string
): string;

export declare const isUuid: (id: any) => boolean;

export declare function retry<T = any>(
  op: () => Promise<T>,
  delaySeconds: number,
  retries: number,
  onRetry: (e: any, retries: number) => any,
  shouldRetry?: (e: any) => boolean
): Promise<T>;

export declare function retryBackoff<T>(
  op: () => Promise<T>,
  delaySeconds: number,
  retries: number,
  onRetry: (e: any, retries: number) => any,
  easing?: (delaySeconds: number) => number
): Promise<T>;

export declare function runLater<TResult>(
  milliseconds: number,
  functionToRunLater: () => Promise<TResult> | TResult
): Promise<TResult>;

export declare class ServiceError extends Error {
  e: any;
  constructor(message: string, e: any);
}

export declare function unionToThrowable<T>(input: T | Error | ServerError): T;
```
