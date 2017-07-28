import Registry from "@magda/typescript-common/dist/Registry";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import unionToThrowable from "@magda/typescript-common/dist/util/union-to-throwable";
import sleuther from "@magda/sleuther-framework/dist/index";
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

const registry = new Registry({
  baseUrl:
    process.env.REGISTRY_URL ||
    process.env.npm_package_config_registryUrl ||
    "http://localhost:6100/v0"
});

sleuthBrokenLinks(registry);

function sleuthBrokenLinks(registry: Registry) {
  async function onRecordFound(record: Record) {
    const distributions: Record[] = record.aspects["dataset-distributions"]
      ? record.aspects["dataset-distributions"].distributions
      : [];

    // Check each link
    const linkChecks: Array<
      [string, () => Promise<BrokenLinkSleuthingResult>]
    > = distributions.map((distribution: Record) =>
      checkDistributionLink(
        distribution,
        distribution.aspects["dcat-distribution-strings"]
      )
    );

    // Group the checks against their host so that we're only making one request per site simultaneously.
    const brokenLinkChecksByHost: Promise<BrokenLinkSleuthingResult[]>[] = _(
      linkChecks
    )
      .groupBy(tuple => tuple[0])
      .values()
      .map(
        (valArray: Array<[string, () => Promise<BrokenLinkSleuthingResult>]>) =>
          valArray.map(innerValue => innerValue[1])
      )
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

    // Record a broken links aspect for each distribution.
    const brokenLinksAspectPromise = Promise.all(
      allResults.map(result => {
        if (result.aspect) {
          return recordBrokenLinkAspect(registry, result).then(() => undefined);
        } else {
          return Promise.resolve();
        }
      })
    );

    const numberWorking = allResults.reduce(
      (soFar: number, result: BrokenLinkSleuthingResult) =>
        soFar + (!result.aspect || result.aspect.status === "active" ? 1 : 0),
      0
    );

    const qualityOp = {
      op: "add",
      path: "/" + brokenLinkAspectDefinition.id,
      value: {
        score: numberWorking / allResults.length,
        weighting: 1
      }
    };

    // Record a single quality aspect for the dataset.
    const qualityPromise = registry
      .patchRecordAspect(record.id, datasetQualityAspectDef.id, [qualityOp])
      .then(result => unionToThrowable(result));

    await Promise.all([brokenLinksAspectPromise, qualityPromise]);
  }

  sleuther({
    registry,
    host,
    id: ID,
    defaultPort: 6111,
    aspects: ["dataset-distributions"],
    optionalAspects: [],
    writeAspectDefs: [brokenLinkAspectDefinition, datasetQualityAspectDef],
    onRecordFound
  }).catch(e => {
    console.error("Error: " + e.message, e);
  });
}

function recordBrokenLinkAspect(
  registry: Registry,
  result: BrokenLinkSleuthingResult
): Promise<Record> {
  return registry
    .putRecordAspect(
      result.distribution.id,
      "source-link-status",
      result.aspect
    )
    .then(unionToThrowable);
}

/**
 * Checks a distribution's URL. Returns a tuple of the distribution's host and a no-arg function that when executed will fetch the url, returning a promise.
 * 
 * @param distribution The distribution Record
 * @param distStringsAspect The dcat-distributions-strings aspect for this distribution
 */
function checkDistributionLink(
  distribution: Record,
  distStringsAspect: any
): [string, () => Promise<BrokenLinkSleuthingResult>] {
  const url = distStringsAspect.downloadURL || distStringsAspect.accessURL;

  if (!url) {
    // If there's no URL for the dataset, just don't return an aspect so nothing gets recorded.
    return [
      "",
      () =>
        Promise.resolve({
          distribution
        })
    ];
  }

  const parsedURL = new URI(url);
  let retrievalPromise: () => Promise<BrokenLinkAspect>;
  if (parsedURL.protocol() === "http" || parsedURL.protocol() === "https") {
    retrievalPromise = () => retrieveHttp(url);
  } else if (parsedURL.protocol() === "ftp") {
    retrievalPromise = () => retrieveFtp(parsedURL);
  } else {
    console.log(`Unrecognised URL: ${url}`);
    const result: BrokenLinkSleuthingResult = {
      distribution,
      aspect: {
        status: "broken",
        errorDetails: `Unrecognised URL: ${url}`
      }
    };
    return ["", () => Promise.resolve(result)];
  }

  return [
    parsedURL.host.toString(),
    () =>
      retrievalPromise().then(aspect => ({
        distribution,
        aspect
      }))
  ];
}

function retrieveFtp(parsedURL: uri.URI): Promise<BrokenLinkAspect> {
  const port = +(parsedURL.port() || 21);
  const pClient = FTPHandler.getClient(parsedURL.hostname(), port);
  return pClient
    .then(client => {
      return new Promise((resolve, reject) => {
        client.list(parsedURL.path(), (err, list) => {
          if (err) {
            reject(err);
          } else if (list.length === 0) {
            reject(new Error(`File "${parsedURL.toString()}" not found`));
          } else {
            resolve(list[0]);
          }
        });
      });
    })
    .then(
      () => {
        return { status: "active" };
      },
      err => {
        console.log(`${err}`);
        return { status: "broken", errorDetails: `${err}` };
      }
    );
}

/**
 * Retrieves an HTTP/HTTPS url
 * 
 * @param url The url to retrieve
 * @param delaySeconds429 How long to wait before trying again if a 429 Too Many Requests status is encountered.
 */
function retrieveHttp(
  url: string,
  delaySeconds429: number = 10
): Promise<BrokenLinkAspect> {
  const operation = () => {
    console.log(url);

    return new Promise((resolve, reject) =>
      request.head(url, (err: Error, response: http.IncomingMessage) => {
        if (err) {
          reject(err);
        } else {
          if (response.statusCode >= 200 && response.statusCode <= 299 || response.statusCode === 429) {
            resolve({
              response
            });
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

  return retryBackoff(operation, 5, 3, (err, retries) => {
    console.log(
      `Downloading ${url} failed: ${err.errorDetails ||
        err.httpStatusCode ||
        err} (${retries} retries remaining)`
    );
  }).then(
    ({ response }) => {
      return {
        status: "active",
        httpStatusCode: response.statusCode
      };
    },
    err => {
      if (err.httpStatusCode === 429) {
        if (delaySeconds429 < 3600) {
          console.log(
            `429 rate limit detected for ${url}, waiting ${delaySeconds429} seconds`
          );
          return new Promise<BrokenLinkAspect>(resolve =>
            setTimeout(
              () => resolve(retrieveHttp(url, delaySeconds429 * 10)),
              delaySeconds429
            )
          );
        } else {
          console.warn(
            `Could not resolve ${url} even after waiting for ${delaySeconds429} seconds`
          );
          return {
            status: "unknown",
            httpStatusCode: err.httpStatusCode,
            errorDetails: err.errorDetails || `${err}`
          };
        }
      } else {
        return {
          status: "broken",
          httpStatusCode: err.httpStatusCode,
          errorDetails: err.errorDetails || `${err}`
        };
      }
    }
  );
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
            console.log(err);
            client.destroy();
            reject(err);
            fulfilled = true;
          }
        });
      });
      console.log(`Attempting to connect to host: ${host}, port: ${port}`);
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
  status: string;
  httpStatusCode?: number;
  errorDetails?: any;
}
