# magda-redis

## Overview

This Helm chart deploys a shared Redis instance used by `registry-api` and `semantic-search-api` for caching.

## Configuration

Redis deployment is controlled by `global.redis.enabled` in the parent `magda-core` values:

- `global.redis.enabled: true` - Deploy an internal Redis instance  
- `global.redis.enabled: false` - Use an external Redis (specify `global.redis.host` and `global.redis.port`)

## Connection Details

When deployed:
- **Host**: `magda-redis-master` (Kubernetes service name)
- **Port**: `6379` (default Redis port)

## For Service Developers

To connect to this Redis from your service:

1. Use the host: `magda-redis-master`
2. Use the port: `6379`

