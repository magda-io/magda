First this requires you to create a secret for the route 53 credentials in the right namespace:

```
kubectl create secret generic prod-route53-credentials-secret --from-literal=secret-access-key=aergaergaegargearger --namespace kube-system
```

For route53 it also required you to create the right IAM policy:

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
