### Overview

Connectors & minions are components that can be deployed in addtional to the [magda-core](https://github.com/magda-io/magda/tree/master/deploy/helm/magda-core) to extend the functionality of your Magda instance and create your own customised Magda deployment.

The default [Magda helm chart](https://github.com/magda-io/magda/tree/master/deploy/helm/magda) is an exmaple of creating a customised Magda deployment (that comes with default connectors & minions) on top of `magda-core`. You can find out more regarding how to reference different components (published Magda helm charts) from its dependencies definition file [requirements.yaml](https://github.com/magda-io/magda/blob/master/deploy/helm/magda/requirements.yaml).

Please note: the `requirements.yaml` above references `magda-core` as local files in order to use the local `magda-core` chart files in this repository. You can (and should) reference the `magda-core` helm chart that published on our helm chart repository in order to use the packed production ready version:

```yaml
dependencies:
    - name: magda-core
      repository: https://charts.magda.io
      version: 0.0.57-0
```

### Package your own connector or minion as deployable component (helm chart)

In order to deploy a connector or minion with `magda-core`, you need to:

-   Build the docker image of the connector / minion and publish to tha docker registry that you use for your deployment (e.g. [docker hub](https://hub.docker.com/)).
-   Create [helm chart](https://helm.sh/docs/topics/charts/) for your connector / minion.
    -   You can publish your helm chart to your helm chart repository
    -   Or you can deploy using you local helm chart files directly using file reference like `file://[path to your chart]`

You can find example setup from our [connector repositories](https://github.com/magda-io?utf8=%E2%9C%93&q=magda+connector) & [minions repositories](https://github.com/magda-io?utf8=%E2%9C%93&q=magda-minion).

The default CI workflows config (using [Github Action](https://github.com/features/actions)) of those repository are created to publishing helm chart to our private magda helm repository.

[Here](https://github.com/magda-io/magda-ckan-connector/tree/4b08982718efa4af63470ed7bbf48db912a1b50a/.github/workflows) is the sample CI workflow config that publishing your helm chart to your github repository [Github Page](https://pages.github.com/).

To use the sample CI workflow, you need to make sure:

-   Create a clean / blank gh-pages branch on your github repository:

```bash
git checkout --orphan gh-pages
# preview files to be deleted
git rm -rf --dry-run .
# actually delete the files
git rm -rf .
git commit -a -m "Init gh-pages commit"
git push origin gh-pages
```

-   Add following information to the Github repository secret settings section:

    -   `GITHUB_ACCESS_TOKEN`: Github person access token
    -   `DOCKER_HUB_PASSWORD`: Your Docker Hub Account Password.

This CI script will:

-   Build & push docker image to docker hub
    -   you can control the docker image name with `config.docker.name` field of your package.json ( here is [a sample config](https://github.com/magda-io/magda-ckan-connector/blob/4b08982718efa4af63470ed7bbf48db912a1b50a/package.json#L61) )
-   Package & push helm chart to Github Page (`gh-pages` branch of your Github repository).
    -   Your helm repo access url will be:
        -   `https://<user>.github.io/<repository>`
        -   Or `https://<organization>.github.io/<repository>`

### Develop a Magda Connector

Connectors are responsible for fetching metadata from external systems and converting their attributes into those represented by "aspects" in the MAGDA system.

Magda has published a list NPM packages to make develop a customise connector much easier. They are:

-   [@magda/connector-sdk](https://www.npmjs.com/package/@magda/connector-sdk)
-   [@magda/connector-test-utils](https://www.npmjs.com/package/@magda/connector-test-utils)
-   [@magda/utils](https://www.npmjs.com/package/@magda/utils)
-   [@magda/scripts](https://www.npmjs.com/package/@magda/scripts): includes docker image building utilities

Most of the existing connectors are written in Javascript and are inherited from the [JSON Connector](https://www.npmjs.com/package/@magda/connector-sdk#jsonconnector) and [JSON Transformer](https://www.npmjs.com/package/@magda/connector-sdk#jsontransformer) base implementations.

If the system you are working with does not use JSON ie. XML, it typical to convert to a JSON representation first.

When developing a new connector, it is useful to save some samples of the source system and implement a [connector test](https://www.npmjs.com/package/@magda/connector-test-utils).

Each aspect-template can then be tested and debugged using the ["debugger;" javascript statement for inline/eval script debugging](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/debugger).

You can find more connector examples from our [connector repositories](https://github.com/magda-io?utf8=%E2%9C%93&q=magda+connector)

### Develop a Magda Minion

A minion is a Magda service that listens for new records or changes to existing records, performs some kind of operation and then writes the result back to the Magda registry. For instance, we have a broken link minion that listens for changes to distributions, retrieves the URLs described, records whether they were able to be accessed successfully and then writes that back to the registry in its own aspect.

Magda has published a list NPM packages for ease of customise minion as well. They are:

-   [@magda/minion-sdk](https://www.npmjs.com/package/@magda/minion-sdk)
-   [@magda/registry-aspects](https://www.npmjs.com/package/@magda/registry-aspects): all Magda built-in aspect definitions
-   [@magda/utils](https://www.npmjs.com/package/@magda/utils)
-   [@magda/scripts](https://www.npmjs.com/package/@magda/scripts): includes docker image building utilities

Here is a simple example to create a minion:

```typescript
import minion, { commonYargs } from "@magda/minion-sdk";
import onRecordFound from "./onRecordFound";

const MINION_ID = "minion-format";
const argv = commonYargs(6311, "http://localhost:6311");

const aspectDefinition = {
    id: "dataset-format",
    name: "Details about the format of the distribution",
    jsonSchema: require("@magda/registry-aspects/dataset-format.schema.json")
};

// --- will be called when changes are made to records in magda registry
async function onRecordFound(record, authorizedRegistryClient) {
    // --- adding logic of based on the current record data, create / update extra data and save back to registry via `authorizedRegistryClient`
}

minion({
    argv,
    // --- monitor `dcat-distribution-strings` aspect
    aspects: ["dcat-distribution-strings"],
    async: true,
    id: MINION_ID,
    onRecordFound,
    optionalAspects: [],
    writeAspectDefs: [aspectDefinition]
}).catch((e: Error) => {
    console.error("Error: " + e.message, e);
    process.exit(1);
});
```

You can find more connector examples from our [minion repositories](https://github.com/magda-io?utf8=%E2%9C%93&q=magda-minion)
