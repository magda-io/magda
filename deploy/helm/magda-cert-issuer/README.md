Before you install this chart install `cert-manager` (required version v1.0 or higher) by following instruction here:

https://cert-manager.io/docs/installation/kubernetes/

This requires you to create a secret for the route 53 credentials in the right namespace:

```
kubectl create secret generic prod-route53-credentials-secret --from-literal=secret-access-key=CHANGEME --namespace cert-manager
```

For route53 it also requires you to create the right IAM policy:

```
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "route53:GetChange",
            "Resource": "arn:aws:route53:::change/*"
        },
        {
            "Effect": "Allow",
            "Action": "route53:ChangeResourceRecordSets",
            "Resource": "arn:aws:route53:::hostedzone/*"
        }
    ]
}
```

Also don't forget to specify `hostedZoneID` (the hosted zone for the domain) and `accessKeyID` (the access key for the user with the above IAM policy).

Then finally install:

```
helm upgrade --install --namespace cert-issuer cert-issuer deploy/helm/magda-cert-issuer --set hostedZoneID=CHANGEME,accessKeyID=CHANGEME,acmeEmail=CHANGEME,useStaging=SHOULDIUSESTAGING
```

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| accessKeyID | string | `nil` |  |
| acmeEmail | string | `nil` |  |
| hostedZoneID | string | `nil` |  |
| secretAccessKeySecretRef.key | string | `"secret-access-key"` |  |
| secretAccessKeySecretRef.name | string | `"prod-route53-credentials-secret"` |  |
| useStaging | bool | `true` |  |