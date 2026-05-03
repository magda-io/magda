# magda-redis

## Overview

This Helm chart deploys a shared Redis instance used by `magda-api` and `semantic-search-api` for caching.

## Configuration

Redis deployment is controlled by `global.redis.enabled` in the parent `magda-core` values:

- `global.redis.enabled: true` - Deploy an internal Redis instance  
- `global.redis.enabled: false` - Use an external Redis (specify `global.redis.host` and `global.redis.port`)

## Connection Details

When deployed:
- **Host**: `magda-redis` (Kubernetes service name)
- **Port**: `6379` (default Redis port)
- **Password**: Optional, controlled by `global.redis.passwordSecret`

## For Service Developers

To connect to this Redis from your service:

1. Use the host: `magda-redis`
2. Use the port: `6379`
3. Retrieve password from the secret `{{ .Values.global.redis.passwordSecret }}` key `redis-password` if authentication is enabled

