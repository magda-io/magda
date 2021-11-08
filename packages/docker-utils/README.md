## MAGDA docker-utils

A set of docker commandline toolkits that is used by [Magda](https://magda.io/) to build docker images.

## Usage

After Adding this package `@magda/docker-utils` as the [devDependencies](https://docs.npmjs.com/specifying-dependencies-and-devdependencies-in-a-package-json-file) in your project or installing the package as a global package via `npm install --global @magda/docker-utils`, you will have command `create-docker-context-for-node-component` & `retag-and-push` available when you write scripts for the `scripts` property of the `package.json` file.

The two scripts takes both parameters from commandline as well `package.json` key `config.docker`.

You can run the script with `--help` switch to print all available commandline options.

You can also find examples from [magda repo](https://github.com/magda-io/magda).

### `create-docker-context-for-node-component`

```bash
> yarn create-docker-context-for-node-component --help
Options:
  --build             Pipe the Docker context straight to Docker.
                                                      [boolean] [default: false]
  --tag               The tag to pass to "docker build".  This parameter is only
                      used if --build is specified.  If the value of this
                      parameter is `auto`, a tag name is automatically created
                      from NPM configuration.         [string] [default: "auto"]
  --repository        The repository to use in auto tag generation. Will default
                      to '', i.e. dockerhub unless --local is set. Requires
                      --tag=auto                                        [string]
  --name              The package name to use in auto tag generation. Will
                      default to ''. Used to override the docker nanme config in
                      package.json during the auto tagging. Requires --tag=auto
                                                                        [string]
  --output            The output path and filename for the Docker context .tar
                      file.                                             [string]
  --local             Build for a local Kubernetes container registry.  This
                      parameter is only used if --build is specified.
                                                      [boolean] [default: false]
  --push              Push the build image to the docker registry.  This
                      parameter is only used if --build is specified.
                                                      [boolean] [default: false]
  --platform          A list of platform that the docker image build should
                      target. Specify this value will enable multi-arch image
                      build.                                            [string]
  --cacheFromVersion  Version to cache from when building, using the
                      --cache-from field in docker. Will use the same repository
                      and name. Using this options causes the image to be pulled
                      before build.                                     [string]
  --help              Show help                                        [boolean]
```

### `retag-and-push`

```bash
> yarn retag-and-push --help
Options:
  --version           Show version number                              [boolean]
  --config            Path to JSON config file
  --help              Show help                                        [boolean]
  --fromPrefix        The prefix of the image that will be given a new tag
                                                          [string] [default: ""]
  --fromName          The package name that used to generate the fromTag. Used
                      to optionally override the docker nanme config in
                      package.json during the auto tagging.
                                                          [string] [default: ""]
  --fromVersion       The version of the existing image that will be given a new
                      tag                    [string] [default: "1.1.0-alpha.0"]
  --toPrefix          The prefix for the tag to push to   [string] [default: ""]
  --toName            The package name that used to generate the toTag. Used to
                      optionally override the docker nanme config in
                      package.json during the auto tagging.
                                                          [string] [default: ""]
  --copyFromRegistry  When `copyFromRegistry`=true,
                      [regctl](https://github.com/regclient/regclient) will be
                      used.
                      The image will be copied directly from remote registry to
                      the destination registry rather than from a local image.
                      This allows copying multi-arch image from one registry to
                      another registry.               [boolean] [default: false]
  --toVersion         The version for the tag to push to
                                             [string] [default: "1.1.0-alpha.0"]
```
