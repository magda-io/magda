minikube config set memory 4096
minikube start
eval $(minikube docker-env)

sbt editsource:clean editsource:edit
kubectl create -f kubernetes/registry.yml

docker build -t localhost:5000/data61/magda-metadata-local:latest -f docker/api.local.dockerfile docker
docker push localhost:5000/data61/magda-metadata-local:latest

kubectl create -f target/kubernetes/local.yml
minikube service api