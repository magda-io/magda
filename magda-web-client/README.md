# magda-web-client

This module contains source code for Magda's default UI.

The default Magda UI is a single page React application that is built on [Magda backend APIs](https://dev.magda.io/api/v0/apidocs/index.html).

## Run it Locally

> Magda is a monorepo. Before run any script in the sub-module, you need to run `yarn install` at the project root.

```bash
yarn dev
```

## Build the Bundle

```bash
yarn build
```

The bundled frontend resouces files can be found from `dist` folder.

## Build Docker Image

`magda-web-client` is served by [magda-web-server](../magda-web-server).

Thus, you need to build docker image from [magda-web-server](../magda-web-server):

- Firstly, run `yarn build` in `magda-web-client` to generate built bundle
- Then, go to [magda-web-server](../magda-web-server):

  - Run `yarn build` to build `magda-web-server`
  - Run `yarn docker-build-local` or `yarn docker-build-prod` for building docker images

  More info can also be found from [this doc](https://github.com/magda-io/magda/blob/master/docs/docs/building-and-running.md#build-local-docker-images)
