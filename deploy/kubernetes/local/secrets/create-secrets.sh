#!/bin/sh
kubectl create secret generic oauth-secrets --from-file=./facebook-client-secret --from-file=./google-client-secret
