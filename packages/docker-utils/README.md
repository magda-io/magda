## MAGDA docker-utils

A set of docker commandline toolkits that is used by [Magda](https://magda.io/) to build docker images.

## Usage

After Adding this package `@magda/docker-utils` as the [devDependencies](https://docs.npmjs.com/specifying-dependencies-and-devdependencies-in-a-package-json-file) in your project or installing the package as a global package via `npm install --global @magda/docker-utils`, you will have command `create-docker-context-for-node-component` & `retag-and-push` available when you write scripts for the `scripts` property of the `package.json` file.

The two scripts takes both parameters from commandline as well `package.json` key `config.docker`.

You can find examples from [magda repo](https://github.com/magda-io/magda).
