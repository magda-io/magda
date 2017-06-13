minikube config set memory 4096
minikube start
eval $(minikube docker-env)

sbt editsource:clean editsource:edit
lerna run docker-build-local

kubectl create secret generic oauth-secrets --from-file=deploy/kubernetes/local/secrets/facebook-client-secret --from-file=deploy/kubernetes/local/secrets/google-client-secret
kubectl apply -f deploy/kubernetes/local/base
