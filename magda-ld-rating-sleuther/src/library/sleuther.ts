import {
  Record,
  WebHook,
  WebHookConfig,
  AspectDefinition
} from "@magda/typescript-common/dist/generated/registry/api";
import Registry, { RecordsPage } from "@magda/typescript-common/dist/Registry";
import AsyncPage, {
  forEachAsync
} from "@magda/typescript-common/dist/AsyncPage";
import express from "express";

type SleutherOptions = {
  registry: Registry;
  host: string;
  id: string;
  aspects: string[];
  optionalAspects: string[];
  writeAspectDefs: AspectDefinition[];
  onRecordFound: (record: Record) => Promise<void>;
};

export default async function sleuther(options: SleutherOptions) {
  setupWebhookEndpoint(options);

  failIfErrors(
    await Promise.all(
      options.writeAspectDefs.map(aspectDef =>
        options.registry.putAspectDefinition(aspectDef)
      )
    )
  );
  await registerWebhookIfNecessary(options);
  await crawlExistingRecords(options);
}

function failIfErrors<T>(results: Array<T | Error>) {
  const failed = results.filter((result: T | Error) => !!(<Error>result));

  if (failed.length > 0) {
    throw failed[0];
  } else {
    return results;
  }
}

function setupWebhookEndpoint(options: SleutherOptions) {
  const server = express();

  server.get(
    "/hook",
    (request: express.Request, response: express.Response) => {
      const payload = request.body();
      const promises: Promise<void>[] = payload.records.map((record: Record) =>
        options.onRecordFound(record)
      );

      Promise.all(promises)
        .then(response.status(201).send("Received"))
        .catch(e => {
          console.error(e);
          response.status(500).send("Error");
        });
    }
  );

  console.log(`Listening at ${getHookUrl(options)}`);
  server.listen(getPort());
}

function getHookUrl(options: SleutherOptions) {
  return `http://${options.host}:${getPort()}/hook`;
}

function getPort() {
  return process.env.NODE_PORT || 80;
}

async function registerWebhookIfNecessary(options: SleutherOptions) {
  console.info("Looking up existing webhooks");
  const hooks = await options.registry.getHooks();

  if (<WebHook[]>hooks) {
    const castHooks = <WebHook[]>hooks;
    console.info("Retrieved webhooks");
    const alreadyExists = castHooks.some(
      hook => hook.url === getHookUrl(options)
    );

    if (alreadyExists) {
      console.info("Hook already exists, no need to register");
      return;
    } else {
      console.info("No hook - registering a new one");
      await registerNewWebhook(options);
    }
  } else {
    console.error("Failed when retrieving existing hooks", <Error>hooks);
    throw <Error>hooks;
  }
}

async function registerNewWebhook(options: SleutherOptions) {
  const webHookConfig: WebHookConfig = {
    aspects: options.aspects,
    optionalAspects: options.optionalAspects,
    includeEvents: false,
    includeRecords: true,
    includeAspectDefinitions: false,
    dereference: true
  };

  const newWebHook: WebHook = {
    userId: 0, // TODO: When this matters
    name: options.id,
    active: true,
    url: getHookUrl(options),
    eventTypes: [
      "CreateRecord",
      "CreateAspectDefinition",
      "CreateRecordAspect",
      "PatchRecord",
      "PatchAspectDefinition",
      "PatchRecordAspect"
      // "DeleteRecord",
      // "DeleteAspectDefinition",
      // "DeleteRecordAspect"
    ],
    config: webHookConfig,
    id: null,
    lastEvent: null
  };

  options.registry.putHook(newWebHook);
}

async function crawlExistingRecords(options: SleutherOptions) {
  const registryPage = AsyncPage.create<RecordsPage<Record>>(previous => {
    if (previous.records.length === 0) {
      // Last page was an empty page, no more records left
      return undefined;
    } else {
      return options.registry
        .getRecords<Record>(
          options.aspects,
          options.optionalAspects,
          previous && previous.nextPageToken,
          true
        )
        .then(page => {
          if (<RecordsPage<Record>>page) {
            return <RecordsPage<Record>>page;
          } else {
            throw <Error>page;
          }
        });
    }
  }).map((page: RecordsPage<Record>) => page.records);

  await forEachAsync(registryPage, 20, (record: Record) =>
    options.onRecordFound(record)
  );
}
