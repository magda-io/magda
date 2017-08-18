import Registry from "@magda/typescript-common/dist/Registry";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import unionToThrowable from "@magda/typescript-common/dist/util/unionToThrowable";
import sleuther, { getRegistry } from "@magda/sleuther-framework/src/index";
import * as _ from "lodash";
import * as request from "request";
import * as http from "http";
import * as Client from "ftp";
import * as LRU from "lru-cache";
import * as URI from "urijs";
import retryBackoff from "@magda/typescript-common/dist/retryBackoff";

const brokenLinkAspectDefinition = {
  id: "source-link-status",
  name: "Details about the downloadURL link status of a distribution",
  jsonSchema: require("@magda/registry-aspects/source-link-status.schema.json")
};
const datasetQualityAspectDef = {
  id: "dataset-quality-rating",
  name: "Data Quality Rating",
  jsonSchema: require("@magda/registry-aspects/dataset-quality-rating.schema.json")
};
const ID = "sleuther-broken-link";
const host = process.env.HOST || ID;

export default async function sleuthBrokenLinks() {
  const registry = getRegistry();

  return await sleuther({
    host,
    id: ID,
    defaultPort: 6111,
    aspects: ["dataset-distributions"],
    optionalAspects: [],
    async: true,
    writeAspectDefs: [brokenLinkAspectDefinition, datasetQualityAspectDef],
    onRecordFound: record =>
      onRecordFound(
        registry,
        record,
        process.env.RETRIES && parseInt(process.env.RETRIES)
      )
  });
}

export async function onRecordFound(
  registry: Registry,
  record: Record,
  baseRetryDelaySeconds: number = 1,
  retries: number = 5,
  base429RetryDelaySeconds = 60
) {
  const distributions: Record[] =
    record.aspects["dataset-distributions"] &&
    record.aspects["dataset-distributions"].distributions;

  if (!distributions || distributions.length === 0) {
    return Promise.resolve();
  }

  // Check each link
  const linkChecks: DistributionLinkCheck[] = _.flatMap(
    distributions,
    (distribution: Record) =>
      checkDistributionLink(
        distribution,
        distribution.aspects["dcat-distribution-strings"],
        baseRetryDelaySeconds,
        retries
      )
  );

  // Group the checks against their host so that we're only making one request per site simultaneously.
  const brokenLinkChecksByHost: Promise<BrokenLinkSleuthingResult[]>[] = _(
    linkChecks
  )
    .groupBy(check => check.host)
    .values()
    .map((checks: DistributionLinkCheck[]) => checks.map(check => check.op))
    .map(checksForHost =>
      // Make the checks for this host run one after the other but return their results as an array.
      checksForHost.reduce(
        (
          megaPromise: Promise<BrokenLinkSleuthingResult[]>,
          promiseLambda: () => Promise<BrokenLinkSleuthingResult>
        ) =>
          megaPromise.then((megaResult: BrokenLinkSleuthingResult[]) =>
            promiseLambda().then(promiseResult =>
              megaResult.concat([promiseResult])
            )
          ),
        Promise.resolve([])
      )
    )
    .value();

  const checkResultsPerHost: BrokenLinkSleuthingResult[][] = await Promise.all(
    brokenLinkChecksByHost
  );

  const allResults = _.flatten(checkResultsPerHost);

  const bestResultPerDistribution = _(allResults)
    .groupBy(result => result.distribution.id)
    .values()
    .map((results: BrokenLinkSleuthingResult[]) =>
      _(results)
        .sortBy(result => {
          return (
            { none: 1, downloadURL: 2, accessURL: 3 }[result.urlType] ||
            Number.MAX_VALUE
          );
        })
        .sortBy(result => {
          return (
            { active: 1, unknown: 2, broken: 3 }[result.aspect.status] ||
            Number.MAX_VALUE
          );
        })
        .head()
    )
    .value();

  // Record a broken links aspect for each distribution.
  const brokenLinksAspectPromise = Promise.all(
    bestResultPerDistribution.map((result: BrokenLinkSleuthingResult) => {
      return recordBrokenLinkAspect(registry, result);
    })
  );

  // brokenLinksAspectPromise.then(() =>
  //   console.log(
  //     "Finished links aspect " + bestResultPerDistribution.length + " links"
  //   )
  // );

  const numberWorking = bestResultPerDistribution.reduce(
    (soFar: number, result: BrokenLinkSleuthingResult) =>
      soFar + (!result.aspect || result.aspect.status === "active" ? 1 : 0),
    0
  );

  const qualityOp = {
    op: "add",
    path: "/" + brokenLinkAspectDefinition.id,
    value: {
      score: numberWorking / bestResultPerDistribution.length,
      weighting: 1
    }
  };

  // console.log(
  //   `Patching aspect ${datasetQualityAspectDef.id} for ${record.id} with ${JSON.stringify(
  //     qualityOp
  //   )}`
  // );

  // Record a single quality aspect for the dataset.
  const qualityPromise = registry
    .patchRecordAspect(record.id, datasetQualityAspectDef.id, [qualityOp])
    .then(result => unionToThrowable(result));

  await Promise.all([brokenLinksAspectPromise, qualityPromise]);
}

function recordBrokenLinkAspect(
  registry: Registry,
  result: BrokenLinkSleuthingResult
): Promise<Record> {
  // console.log(
  //   `Putting aspect ${"source-link-status"} for ${encodeURIComponent(
  //     result.distribution.id
  //   )} with ${JSON.stringify(result.aspect)}`
  // );

  return registry
    .putRecordAspect(
      result.distribution.id,
      "source-link-status",
      result.aspect
    )
    .then(unionToThrowable);
}

type DistributionLinkCheck = {
  host?: string;
  op: () => Promise<BrokenLinkSleuthingResult>;
};

/**
 * Checks a distribution's URL. Returns a tuple of the distribution's host and a no-arg function that when executed will fetch the url, returning a promise.
 * 
 * @param distribution The distribution Record
 * @param distStringsAspect The dcat-distributions-strings aspect for this distribution
 */
function checkDistributionLink(
  distribution: Record,
  distStringsAspect: any,
  baseRetryDelay: number,
  retries: number
): DistributionLinkCheck[] {
  type DistURL = {
    url?: string;
    type: "downloadURL" | "accessURL";
  };

  const urls: DistURL[] = [
    {
      url: distStringsAspect.downloadURL as string,
      type: "downloadURL" as "downloadURL"
    },
    {
      url: distStringsAspect.accessURL as string,
      type: "accessURL" as "accessURL"
    }
  ].filter(x => !!x.url);

  if (urls.length === 0) {
    return [
      {
        op: () =>
          Promise.resolve({
            distribution,
            urlType: "none" as "none",
            aspect: {
              status: "broken" as RetrieveResult,
              errorDetails: new Error("No distribution urls to check.")
            }
          })
      }
    ];
  }

  return urls.map(url => {
    const parsedURL = new URI(url.url);
    return {
      host: (parsedURL && parsedURL.host()) as string,
      op: () =>
        retrieve(parsedURL, baseRetryDelay, retries)
          .then(aspect => ({
            distribution,
            urlType: url.type,
            aspect
          }))
          .catch(err => ({
            distribution,
            urlType: url.type,
            aspect: {
              status: "broken" as RetrieveResult,
              errorDetails: err
            }
          })) as Promise<BrokenLinkSleuthingResult>
    };
  });
}

function retrieve(
  parsedURL: uri.URI,
  baseRetryDelay: number,
  retries: number
): Promise<BrokenLinkAspect> {
  if (parsedURL.protocol() === "http" || parsedURL.protocol() === "https") {
    return retrieveHttp(parsedURL.toString(), baseRetryDelay, retries);
  } else if (parsedURL.protocol() === "ftp") {
    return retrieveFtp(parsedURL);
  } else {
    console.info(`Unrecognised URL: ${parsedURL.toString()}`);
    return Promise.resolve({
      status: "unknown" as "unknown",
      errorDetails: new Error(
        "Could not check protocol " + parsedURL.protocol()
      )
    });
  }
}

function retrieveFtp(parsedURL: uri.URI): Promise<BrokenLinkAspect> {
  const port = +(parsedURL.port() || 21);
  const pClient = FTPHandler.getClient(parsedURL.hostname(), port);

  return pClient.then(client => {
    return new Promise<BrokenLinkAspect>((resolve, reject) => {
      client.list(parsedURL.path(), (err, list) => {
        if (err) {
          reject(err);
        } else if (list.length === 0) {
          reject(new Error(`File "${parsedURL.toString()}" not found`));
        } else {
          resolve({ status: "active" as "active" });
        }
      });
    });
  });
}

/**
 * Retrieves an HTTP/HTTPS url
 * 
 * @param url The url to retrieve
 */
function retrieveHttp(
  url: string,
  baseRetryDelay: number,
  retries: number
): Promise<BrokenLinkAspect> {
  const operation: () => Promise<number> = () => {
    return new Promise((resolve, reject) =>
      request.head(url, (err: Error, response: http.IncomingMessage) => {
        if (err) {
          reject(err);
        } else {
          if (
            (response.statusCode >= 200 && response.statusCode <= 299) ||
            response.statusCode === 429
          ) {
            resolve(response.statusCode);
          } else {
            reject(
              new BadHttpResponseError(
                response.statusMessage,
                response,
                response.statusCode
              )
            );
          }
        }
      })
    );
  };

  const onRetry = (err: BadHttpResponseError, retries: number) => {
    console.info(
      `Downloading ${url} failed: ${err.httpStatusCode ||
        err} (${retries} retries remaining)`
    );
  };

  const innerOp = () =>
    retryBackoff(operation, baseRetryDelay, retries, onRetry);

  const outerOp: () => Promise<BrokenLinkAspect> = () =>
    innerOp().then(
      code => {
        if (code === 429) {
          throw new Error("429 encountered");
        } else {
          return { status: "active" as "active", httpStatusCode: code };
        }
      },
      error => {
        return {
          status: "broken" as "broken",
          httpStatusCode: error.httpStatusCode,
          errorDetails: error
        };
      }
    );

  return retryBackoff(
    outerOp,
    baseRetryDelay,
    retries,
    onRetry,
    (x: number) => x * 5
  ).catch(err => ({
    status: "unknown" as "unknown",
    errorDetails: err,
    httpStatusCode: 429
  }));
}

class BadHttpResponseError extends Error {
  public response: http.IncomingMessage;
  public httpStatusCode: number;

  constructor(
    message?: string,
    response?: http.IncomingMessage,
    httpStatusCode?: number
  ) {
    super(message);
    this.message = message;
    this.response = response;
    this.httpStatusCode = httpStatusCode;
    this.stack = new Error().stack;
  }
}

namespace FTPHandler {
  export const lru = LRU<Promise<Client>>({
    max: 20,
    dispose(key, pClient) {
      pClient.then(client => client.end());
    }
  });

  export function getClient(host: string, port: number) {
    let pClient = lru.get(`${host}:${port}`);
    if (pClient) {
      return pClient;
    } else {
      const client = new Client();
      let fulfilled = false;
      pClient = new Promise((resolve, reject) => {
        client.on("ready", () => {
          fulfilled = true;
          resolve(client);
        });
        client.on("error", (err: Error) => {
          if (!fulfilled) {
            console.info(err);
            client.destroy();
            reject(err);
            fulfilled = true;
          }
        });
      });
      console.info(`Attempting to connect to host: ${host}, port: ${port}`);
      client.connect({
        host,
        port,
        keepalive: 0
      });
      lru.set(`${host}:${port}`, pClient);
      return pClient;
    }
  }
}

interface BrokenLinkSleuthingResult {
  distribution: Record;
  aspect?: BrokenLinkAspect;
  urlType: "downloadURL" | "accessURL" | "none";
}

export type RetrieveResult = "active" | "unknown" | "broken";

export interface BrokenLinkAspect {
  status: RetrieveResult;
  httpStatusCode?: number;
  errorDetails?: any;
}
