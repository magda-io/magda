# graph-db

![Version: 0.0.60-alpha.0](https://img.shields.io/badge/Version-0.0.60--alpha.0-informational?style=flat-square) ![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square)

Graph database (neo4j) module for Magda.

This is a simple wraper of [neo4j offical community version helm chart](https://github.com/neo4j-contrib/neo4j-helm).

By default, community version docker image is used with `standalone` mode turned on.

All neo4j helm chart configuration can be set under key `neo4j`.

For all available neo4j configuration options, please refer to [neo4j offical helm chart document](https://neo4j.com/labs/neo4j-helm/1.0.0/).

After deployed, by default, the DB can be accessed in cluster via `bolt://graph-db:7687`

The auto-generated password can be accessed via secret `graph-db-secrets`.

## Requirements

Kubernetes: `>= 1.14.0-0`

| Repository | Name | Version |
|------------|------|---------|
| https://neo4j-contrib.github.io/neo4j-helm/ | neo4j | 4.2.2-1 |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| neo4j.authEnabled | bool | `true` | whether turn on auth |
| neo4j.core.configMap | string | `nil` | Optional configmap that contains extra env vars to be set on neo4j instance. |
| neo4j.core.persistentVolume.size | string | `"10Gi"` |  |
| neo4j.core.resources | object | `{"limits":{"cpu":"500m"},"requests":{"cpu":"200m","memory":"1024Mi"}}` | config neo4j instance resources |
| neo4j.core.standalone | bool | `true` | Whether to run in single-server `standalone` mode. If you need neo4j cluster, neo4j commercial version license is required. |
| neo4j.existingPasswordSecret | string | `nil` | the secret name that contains db access password leave blank then neo4j will auto create password & secret |
| neo4j.fullnameOverride | string | `"graph-db"` |  |
| neo4j.imageTag | string | `"4.1.3"` |  |
| neo4j.plugins | string | `"[\"apoc\",\"n10s\"]"` |  |