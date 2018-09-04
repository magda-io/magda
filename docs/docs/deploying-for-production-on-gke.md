This is a guide to deploying a highly-available version of magda for production use, similar to what's used on search.data.gov.au. Be aware this is heavily coupled to our providers and costs roughly $1000/month. If you want something lighter, look at just using the defaults in https://github.com/magda-io/magda-config and modifying them as you go.

What you'll be using if you run Magda like this:

-   Google Kubernetes Engine
-   Google Cloud SQL
-   AWS Route53
-   Mailgun

1.  Set up a Google Cloud SQL database: https://cloud.google.com/sql/docs/mysql/connect-kubernetes-engine. Make sure you set that up for HA too.
2.  Install cert-manager and a cert issuer: https://github.com/magda-io/magda/tree/master/deploy/helm/magda-cert-issuer
3.

2)  Follow the instructions at https://github.com/magda-io/magda-config, but instead fork from https://github.com/magda-io/magda-config-data.gov.au. Make sure to change:

-   `global.externalUrl`: What's the external url that you'll be deploying the website on?
-   `gateway.auth.x`: Put the ids of your google/facebook apps for OAuth if you have them. You'll also need to create an `oauth-secrets` secret containing a `facebook-client-secret` and `google-client-secret`.
-   `connectors.config`: Put the external connectors you want to use here
-   `ingress.ipName`: Should
-   `ingress` (others): Make sure you've put your hostname and any other domains you want to get a let's encrypt cert for here.
-   `correspondence-api.defaultRecipient`: This should be a general email
-   `gateway.ckanRedirectionDomain`: If you're replacing a CKAN instance set the domain here, otherwise leave it out.
-   `gateway.csp`: Put your CSP overrides in here and take out SDGA's.
-   `cloud-sql-proxy.instanceConnectionName`: Needs to be the name of your Google Cloud SQL instance

3.

3.  Install MAGDA:

```bash
helm install --name magda deploy/helm/magda -f <path to your config file>
```

If this doesn't work for you, [file an issue](https://github.com/TerriaJS/magda/issues).
