kubectl create secret generic oauth-secrets \
  --from-file=./facebook-client-secret \
  --from-file=./google-client-secret \
  --from-file=./jwt-secret \
  --from-file=./session-secret