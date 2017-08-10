import Registry from "@magda/typescript-common/dist/Registry";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import unionToThrowable from "@magda/typescript-common/dist/util/union-to-throwable";
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
  retries: number = 5
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
  retries: number
): DistributionLinkCheck[] {
  const urls = [
    distStringsAspect.downloadURL,
    distStringsAspect.accessURL
  ].filter(x => !!x);

  if (urls.length === 0) {
    return [
      {
        op: () =>
          Promise.resolve({
            distribution,
            aspect: {
              status: "broken" as "broken"
            }
          })
      }
    ];
  }

  return urls.map(url => {
    const parsedURL = new URI(url);
    return {
      host: (parsedURL && parsedURL.host()) as string,
      op: () =>
        retrieve(parsedURL, retries)
          .then(result => ({
            distribution,
            aspect: {
              status: result
            }
          }))
          .catch(err => ({
            distribution,
            aspect: {
              status: "broken" as "broken"
            }
          })) as Promise<BrokenLinkSleuthingResult>
    };
  });
}

type RetrieveResult = "active" | "unknown";
function retrieve(
  parsedURL: uri.URI,
  retries: number
): Promise<RetrieveResult> {
  if (parsedURL.protocol() === "http" || parsedURL.protocol() === "https") {
    return retrieveHttp(parsedURL.toString(), retries);
  } else if (parsedURL.protocol() === "ftp") {
    return retrieveFtp(parsedURL);
  } else {
    console.info(`Unrecognised URL: ${parsedURL.toString()}`);
    return Promise.resolve("unknown" as "unknown");
  }
}

function retrieveFtp(parsedURL: uri.URI): Promise<RetrieveResult> {
  const port = +(parsedURL.port() || 21);
  const pClient = FTPHandler.getClient(parsedURL.hostname(), port);
  return pClient.then(client => {
    return new Promise<RetrieveResult>((resolve, reject) => {
      client.list(parsedURL.path(), (err, list) => {
        if (err) {
          reject(err);
        } else if (list.length === 0) {
          reject(new Error(`File "${parsedURL.toString()}" not found`));
        } else {
          resolve("active" as "active");
        }
      });
    });
  });
}

/**
 * Retrieves an HTTP/HTTPS url
 * 
 * @param url The url to retrieve
 * @param delaySeconds429 How long to wait before trying again if a 429 Too Many Requests status is encountered.
 */
function retrieveHttp(
  url: string,
  retries: number,
  delaySeconds429: number = 10
): Promise<RetrieveResult> {
  const operation = () => {
    return new Promise((resolve, reject) =>
      request.head(url, (err: Error, response: http.IncomingMessage) => {
        if (err) {
          reject(err);
        } else {
          if (response.statusCode >= 200 && response.statusCode <= 299) {
            resolve();
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

  return retryBackoff(operation, retries, 3, (err, retries) => {
    console.info(
      `Downloading ${url} failed: ${err.errorDetails ||
        err.httpStatusCode ||
        err} (${retries} retries remaining)`
    );
  })
    .then(() => "active" as "active")
    .catch((err: any) => {
      if (err.httpStatusCode === 429) {
        if (delaySeconds429 < 3600) {
          console.info(
            `429 rate limit detected for ${url}, waiting ${delaySeconds429} seconds`
          );
          return new Promise<RetrieveResult>(resolve =>
            setTimeout(
              () => resolve(retrieveHttp(url, delaySeconds429 * 10)),
              delaySeconds429
            )
          );
        } else {
          console.warn(
            `Could not resolve ${url} even after waiting for ${delaySeconds429} seconds`
          );
          throw err;
        }
      } else {
        throw err;
      }
    });
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
        port
      });
      lru.set(`${host}:${port}`, pClient);
      return pClient;
    }
  }
}

interface BrokenLinkSleuthingResult {
  distribution: Record;
  aspect?: BrokenLinkAspect;
}

interface BrokenLinkAspect {
  status: RetrieveResult | "broken";
  httpStatusCode?: number;
  errorDetails?: any;
}
