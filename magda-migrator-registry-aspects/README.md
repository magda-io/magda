# Magda Registry Aspect Definition Migrator

This module will produce a docker image that can be run as a k8s job to make sure all built-in [registry aspect definitions](https://github.com/magda-io/magda/tree/master/magda-registry-aspects) are in place.

> Please note: this module will only create the aspect definition when an aspect definition doesn't exist. It will not attempt to overwrite any existing aspect definitions to avoid overwriting any user changes on the definitions.
