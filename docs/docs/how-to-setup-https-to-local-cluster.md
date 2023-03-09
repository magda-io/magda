## How to setup HTTPS access to a local development cluster

### Why HTTPS on a Local Dev Cluster

Since [Google’s SameSite Cookie Changes Roll-out](https://www.chromium.org/updates/same-site), you will find it is getting harder to test a local Web UI client with an API backend running in a local K8s dev cluster. Firstly, you need to set your cookie’s [SameSite](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite) setting to “None” in order to enable cross-origin requests. However, a cookie with "SameSite=None" setting only will also be rejected by Google Chrome unless you set "[Secure=true](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie#Secure)" to make the cookie only available through HTTPS connections. This makes HTTPS access a “must-have” when test your local cluster for the use case above.

### Prerequisites

- [Helm](https://helm.sh/)
- Local K8s cluster setup with [Minikube](https://minikube.sigs.k8s.io/docs/start/)
- MAGDA installed with internal [ingress chart](https://github.com/magda-io/magda/tree/master/deploy/helm/internal-charts/ingress) turned off (Default value)

### Install Cert Manager

To issue a self-signed certificate for your cluster, you need to install cert-manager first:

- Installing Cert Manager CRDs with kubectl

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.7.3/cert-manager.crds.yaml
```

- Installing Cert Manager with Helm

```bash
# If you haven't install jetstack helm chart repo yet
helm repo add jetstack https://charts.jetstack.io

# Create namespace for cert-manager
kubectl create namespace cert-manager

# install cert manager v1.7.3
helm upgrade --namespace cert-manager --version 1.7.3 --install cert-manager jetstack/cert-manager
```

### Create Self-Signed Cert Issuer

Run the following command:

```
kubectl apply -f https://gist.githubusercontent.com/t83714/51440e2ed212991655959f45d8d037cc/raw/7b16949f95e2dd61e522e247749d77bc697fd63c/selfsigned-issuer.yaml
```

to create a `ClusterIssuer` with name `selfsigned-issuer`.

### Setting Up Ingress for deployed MAGDA

- Prepare ingress controller

  - If using `minikube`, enable the built-in [minikube ingress controller](https://kubernetes.io/docs/tasks/access-application-cluster/ingress-minikube/#enable-the-ingress-controller) by running command:

    ```bash
    minikube addons enable ingress
    ```

- Save the following content as file `ingress.yaml` and edit to suit your need. Here, `selfsigned-issuer` is the name of the self-signed certificate issuer that we've just created and `minikube.data.gov.au` is the local domain we intend to use.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: local-ingress
  annotations:
    cert-manager.io/cluster-issuer: selfsigned-issuer
    # optional allow max file upload size 100M
    nginx.ingress.kubernetes.io/client-body-buffer-size: 100M
    nginx.ingress.kubernetes.io/proxy-body-size: 100M
spec:
  rules:
    - host: minikube.data.gov.au
      http:
        paths:
          - backend:
              service:
                name: gateway
                port:
                  number: 80
            path: /
            pathType: "Prefix"
  tls:
    - hosts:
        - minikube.data.gov.au
      secretName: magda-local-cert-tls
```

Run:

```bash
kubectl -n [my-namespace] apply -f ingress.yaml
```

to create the ingress in the your MAGDA deployment namespace.

### Access your cluster via HTTPS

To make test domain `minikube.data.gov.au` accessible locally, you also need to add the following entry to file `/etc/hosts` (on windows, it is `c:\Windows\System32\Drivers\etc\hosts`):

```
# Here 192.168.64.1 is your minikube cluster IP.
# You can use command `minikube ip` to find it out.
192.168.64.1    minikube.data.gov.au
```

> Please note: When you use minikube with [docker driver](https://minikube.sigs.k8s.io/docs/drivers/) (e.g. on an Apple M1 machine), you won't be able to access the ingress exposed services via minikube IP. You need to run `minikube tunnel` to make the service avaiable via local ip `127.0.0.1` instead. You will also need to map `minikube.data.gov.au` to IP `127.0.0.1` instead in `/etc/hosts`.

Before access your test domain, you also need to make your local machine trust the self-signed certificate issued by local issuer.

Generally, you can:

- Accessing the site with your web browser, click the security warning and download the certificate file from certificate info window
- [On a Mac](https://support.securly.com/hc/en-us/articles/206058318-How-to-install-the-Securly-SSL-certificate-on-Mac-OSX-), add the certifcate to your Keychain Access App and select trust the certificate. And [on a Windows](https://www.pico.net/kb/how-do-you-get-chrome-to-accept-a-self-signed-certificate), import certificate to Google chrome's "Manage certificates" area
