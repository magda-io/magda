import {
  Record,
  WebHook,
  WebHookConfig,
  AspectDefinition
} from "@magda/typescript-common/dist/generated/registry/api";
import Registry, { RecordsPage } from "@magda/typescript-common/dist/Registry";
import unionToThrowable from "@magda/typescript-common/dist/util/union-to-throwable";
import AsyncPage, {
  forEachAsync
} from "@magda/typescript-common/dist/AsyncPage";
import * as express from "express";

export interface SleutherOptions {
  host: string;
  defaultPort: number;
  id: string;
  aspects: string[];
  optionalAspects: string[];
  writeAspectDefs: AspectDefinition[];
  onRecordFound: (record: Record) => Promise<void>;
  express?: () => express.Express;
}

export function getRegistry() {
  return new Registry({
    baseUrl:
      process.env.REGISTRY_URL ||
      process.env.npm_package_config_registryUrl ||
      "http://localhost:6101/v0"
  });
}

export default async function sleuther(
  options: SleutherOptions
): Promise<void> {
  checkOptions(options);

  options.express = options.express || (() => express());
  const registry = getRegistry();

  setupWebhookEndpoint();

  await putAspectDefs();
  await registerWebhook();
  await crawlExistingRecords();

  function checkOptions(options: SleutherOptions) {
    if (options.defaultPort <= 0 || options.defaultPort > 65535) {
      throw new Error(`Default port of ${options.defaultPort} is invalid`);
    }

    if (options.id === "") {
      throw new Error(`id is unspecified`);
    }

    if (options.host === "") {
      throw new Error(`Host is unspecified`);
    }

    const containsBlank = (strings: string[]) =>
      strings.some(string => string === "");

    if (containsBlank(options.aspects)) {
      throw new Error(`Aspects ${options.aspects} contains a blank aspect`);
    }

    if (containsBlank(options.optionalAspects)) {
      throw new Error(
        `Aspects ${options.optionalAspects} contains a blank aspect`
      );
    }
  }

  async function putAspectDefs() {
    const aspectDefsToAdd = options.writeAspectDefs;
    console.info(`Adding aspect defs ${aspectDefsToAdd.map(def => def.name)}`);

    const addPromises = aspectDefsToAdd.map(aspectDef =>
      registry.putAspectDefinition(aspectDef)
    );

    return Promise.all(addPromises).then(failIfErrors).then(result => {
      console.info("Successfully added aspect defs");
      return result;
    });
  }

  function failIfErrors<T>(results: Array<T | Error>) {
    const failed = results.filter(
      (result: T | Error) => result instanceof Error
    );

    if (failed.length > 0) {
      throw failed[0];
    } else {
      return results;
    }
  }

  function setupWebhookEndpoint() {
    const server = options.express();
    server.use(require("body-parser").json());

    server.post(
      "/hook",
      (request: express.Request, response: express.Response) => {
        const payload = request.body;
        const promises: Promise<
          void
        >[] = payload.records.map((record: Record) =>
          options.onRecordFound(record)
        );

        Promise.all(promises)
          .then(results => {
            response.status(201).send("Received");
          })
          .catch(e => {
            console.error(e);
            response.status(500).send("Error");
          });
      }
    );

    console.info(`Listening at ${getHookUrl()}`);
    server.listen(getPort());
  }

  function getHookUrl() {
    return `http://${options.host}:${getPort()}/hook`;
  }

  function getPort() {
    return parseInt(process.env.NODE_PORT) || options.defaultPort;
  }

  async function registerWebhook() {
    console.info("Registering webhook");
    await registerNewWebhook();
  }

  async function registerNewWebhook() {
    const webHookConfig: WebHookConfig = {
      aspects: options.aspects,
      optionalAspects: options.optionalAspects,
      includeEvents: false,
      includeRecords: true,
      includeAspectDefinitions: false,
      dereference: true
    };

    const newWebHook: WebHook = {
      id: options.id,
      userId: 0, // TODO: When this matters
      name: options.id,
      active: true,
      url: getHookUrl(),
      eventTypes: [
        "CreateRecord",
        "CreateAspectDefinition",
        "CreateRecordAspect",
        "PatchRecord",
        "PatchAspectDefinition",
        "PatchRecordAspect"
      ],
      config: webHookConfig,
      lastEvent: null,
      isWaitingForResponse: false
    };

    registry.putHook(newWebHook);
  }

  async function crawlExistingRecords() {
    const registryPage = AsyncPage.create<RecordsPage<Record>>(previous => {
      if (previous && previous.records.length === 0) {
        console.info("No more records left");
        // Last page was an empty page, no more records left
        return undefined;
      } else {
        console.info(
          "Crawling after token " +
            (previous && previous.nextPageToken
              ? previous.nextPageToken
              : "<first page>")
        );
        return registry
          .getRecords<Record>(
            options.aspects,
            options.optionalAspects,
            previous && previous.nextPageToken,
            true
          )
          .then(unionToThrowable)
          .then(page => {
            console.info(`Crawled ${page.records.length} records`);
            return page;
          });
      }
    }).map((page: RecordsPage<Record>) => page.records);

    await forEachAsync(registryPage, 20, (record: Record) =>
      options.onRecordFound(record)
    );
  }
}
