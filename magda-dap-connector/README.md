# Dap Connector

> How to implement Dap connector using existing magda components

## How the connector works

I choose the existing ckan connector as a template to start the dap connector develop in following two reasons:

-   The Dap Dataset supports json data view
-   The Magda common data transfering and aspects building functions were built based on JSON format
-   Ckan connector was well implemented by Magda team
-   The API of ckan and DAP was similar

### How Dap connector works

A connector can be run in two ways:

-   Development: `npm run dev -- --config ../deploy/connector-config/csiro-dap.json --userId="00000000-0000-4000-8000-000000000000" --jwtSecret="squirrel"`
-   Product on K8S:
    -   `cd deploy && npm run generate-connector-jobs-local`
    -   `kubectl create -f deploy/kubernetes/generated/local/connnctor-csiro-dap-cron.json`

1.  As specified in package.json: `"dev": "run-typescript-in-nodemon src/index.ts",`, the `npm run dev` command will start the connector by call `index.ts`.
1.  The `index.ts` in magda-dap-connector creates a `JsonConnector` and runs it.
1.  `new JsonConnector` requires three combined options: source: dap, transformer, and registry.

    -   Source `Dap.ts` defines data retrieve and response rules, such as returnning the datasets, distributions, and organizations by calling functions `getJsonDatasets()`, `getJsonDistributions(dataset: any)` and `getJsonFirstClassOrganizations()`.
    -   Transformer `DapTransformer.ts` defines the rules of how the key attributes were specified from a json dataset.

        > Example: getIdFromJsonOrganization() returns a ConnectorRecordId object with organization identifier (name here), Type, and Source identifier .

        `DapTransformer.ts` only defines some very basic rule of get IDs and Names from. `index.ts` also uses the transform rules defined in `aspect-templates` director to map the key-values from a dataset to target object. In order to organize these transformer options, `transformerOptions`. `datasetAspectBuilders`, `distributionAspectBuilders`, and `organizationAspectBuilders` were used in `index.ts` to clearify the transforming rules.

    -   Registry defines registry url, userid and jwtSecret for Registry connection.

1.  The `run()` will call the `async run()` in `JsonConnector.ts`, which will use its internal pre-defined methods to create dataset, distributions and organization aspects, and to combine the results.
1.  Different with the datasets and distributions transforming, which will be launched by default, the organization could be turn on/off by configing the `hasFirstClassOrganizations` to true or false.

## Implement Dap.ts

1.  `class Dap implements ConnectorSource ( the interface located at magda-typescript-common/src/JsonConnector.ts)`, nine functions should be implemented. But because the publisher and organization of CSIRO Dap were fixed, a few of six functions could just leave it as it in Ckan.ts.

    1.  `getJsonDatasets(): AsyncPage<any[]>;` - Get all of the datasets as pages of objects
    1.  `getJsonDistributions(dataset: any): AsyncPage<any[]>;` - Gets the distributions of a given dataset.
    1.  `getJsonDatasetPublisherId(dataset: any): string;` - Gets the ID of the publisher of this dataset.

    -   is false because non-first-class organizations do not have IDs.dataset given its ID. ~~
        Following functions are no needed to implement for Dap connector.

    1.  ~~`getJsonDataset(id: string): Promise<any>;`~~
    1.  ~~`searchDatasetsByTitle(...)`~~
    1.  `getJsonFirstClassOrganizations()` - return a fixed array with CSIRO DAP dataset organization information:
        ```json
        [
            {
                "name": "csiro-data-access-portal",
                "identifier": "csiro-data-access-portal",
                "title": "CSIRO Data Access Portal",
                "description":
                    "The Commonwealth Scientific and Industrial Research Organisation (CSIRO) ...",
                "imageUrl":
                    "https://data.csiro.au/dap/resources-2.6.6/images/csiro_logo.png"
            }
        ]
        ```
    1.  ~~`getJsonFirstClassOrganization(id: string)`~~
    1.  ~~`searchFirstClassOrganizationsByTitle(...)`~~
    1.  ~~`getJsonDatasetPublisher(...)`~~

1.  `getJsonDatasets(): AsyncPage<any[]>` function returns an AsyncPage, which carries datasets collected recursivly page by page using the `packageSearch()` function by giving an url such as `https://data.csiro.au/dap/ws/v2/collections.json` ? (still unclear how the recursive call works). the `map()` fucntion of the AsyncPage object could retrieve the dataset array in synchronizing way and return the `detailDataCollections`, which was created by `requestPackageSearchPage()` method (will be introduced later).
1.  For Ckan data, `requestPackageSearchPage()` could return datasets including all attributes such as distribution. However, for Dap, this function could only return a summary of datasets array with only some key information included, and missing some important attributes, such as the data attribute (an url for distributed data), which will be used to retrieve distributions.
    -   In order to solve this issue, some async/wait code were added at `requestPackageSearchPage().request()` callback function, which will use the returned datasets' identifiers to query detailed datasets again.
    -   This sub-process uses `async/await` keywords and `Promise.all()` method to ensure the `request() resove()` method invoked only after all sub-processes completed.
    -   At the `Promise.all().then()` callback, these detailed datasets were combined together and were attached to the datasets with a new attribute name `detailDataCollections`.
1.  Because of the searching result of Dap doesn't include the distributions. The `getJsonDistributions()` and `requestDistributions()` are also been rewritten to retrieve distributions using the uri specified in dataset.data attribute.
1.  Because of the constrain of interface, `getJsonDistributions()` will use `requestDistributions()` to get a Promise, and then to create a AsyncPage for return.
1.  At the callback function of `requestDistributions()`, a few new attributes are added to the returned distribution object, the new object is combined as an array. And finally a distribution array for a given dataset is resolved/returned.
1.  Becuase the organization for DAP was fixed, modify `getJsonFirstClassOrganizations()` function and set its return content as fixed CSIRO DAP information.

## Modify index.ts

-   Modify [dataset|distribution|organization]AspectBuilders, and add required schema at magda-registry-aspiects directory.
-   Modify the source from Ckan to Dap.

## Modify Scripts in aspect-templates

the returned dataset objects and distribution objects from Dap.ts can be accessed directly within these files.

1.  Dataset Aspects:

-   `dap-dataset.js` copies the Dap dataset as its aspect of dap-dataset
-   `dcat-dataset-string.js` defines the transfer from Dap dataset to dcat.
-   `dataset-source.js` defines the transfer from Dap object / Dap dataset to the source aspect.

1.  Distribution Aspects:

-   `dap-resource.js` returns a distribution object.
-   `dcat-distribution-string.js` defines the transfer from Dap distribution to dcat.
-   `distribution-source.js defines the transfer from Dap object / Dap distribution object to the source aspect.

## Modify DapUrlBuilder.ts

Different with ckan (which uses an api rules like http://docs.ckan.org/en/latest/api/), Dap used the uri defination at
https://confluence.csiro.au/display/daphelp/Web+Services+Interface. `DapUrlBuilder.ts` should be changed to adapt the difference.

-   `getPackageSearchUrl()` in Dap connector is the base url such as defined in magda/deploy/connector-config/csiro-dap.json: `"sourceUrl": "https://data.csiro.au/dap/ws/v2/",`
-   `getPackageShowUrl(id: string)` returns the uri of specific dataset given its id. In Dap, the uri is `baseurl/id`, eg. `https://data.csiro.au/dap/ws/v2/csiro:12345`
-   `getResourceShowUrl(id: string)` return the uri of distributions of a given dataset's id. eg. `https://data.csiro.au/dap/ws/v2/csiro:12345/data`

## Modify DapTransformer

Because the matadata between ckan and Dap is different, some key information should be transformed, such as ID and name of dataset, organization, and distribution.

-   `DapTransformer.ts` extends JsonTransformer, and the ID&name specification defined here can rewritten the default behavior in JsonTransformer.
-   Following the metadata of Dap, the `getIdFromJsonDataset()`, `getIdFromJsonDistribution()`, `getNameFromJsonDataset(0)`, and `getNameFromJsonDistribution()` should be modified.
-   If configed `hasFirstClassOrganizations=true`, `getIdFromJsonOrganization()` and `getNameFromJsonOrganization()` should be implemented.

## Building

Requires SBT to be installed to generated the swagger files from the registry.

```bash
npm run build
```

If you're using Visual Studio Code (recommended), execute `Tasks: Run Build Task` (CTRL-SHIFT-B) to build and watch (build again on changes).

## Running in dev

### on minikube

-   prerequirement: both combined-db and regiestry installed and minikube started

```bash
npm run dev -- --config ../deploy/connector-config/csiro-dap.json --userId="00000000-0000-4000-8000-000000000000" --jwtSecret="squirrel" --registryUrl="http://192.168.137.104:30860/v0"
```

-   `http://192.168.137.104:30860/v0` is a regiestry server on minikube with cluster IP and service port.
-   It can be changed to the port of a regiestry pod, such as pod
    registry-api-769df78877-q2mpj `http://192.168.137.104:30101/v0`

### on local machine with combined-db installed on minikube

-   forward combined-db port to local: `kubectl port-forward combined-db-0 5432:5432`
-   run regiestry in dev mode: `cd magda-regiestry-api&& npm run dev`
-   run dap connctory in dev mode `cd magda-dap-connector&& npm run dev -- --config ../deploy/connector-config/csiro-dap.json --userId="00000000-0000-4000-8000-000000000000" --jwtSecret="squirrel"`
