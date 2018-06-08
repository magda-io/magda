### Push the new version to dockerhub

-   [ ] Check out master and ensure you don't have any extra changes

```bash
git checkout master
git status
```

-   [ ] `git pull`

-   [ ] Check this out into a release branch

```
git checkout -b release/0.0.x
```

-   [ ] At the root, run `lerna bootstrap`

-   [ ] Run `lerna publish` to bump the version number to a Release Candidate version (`v*.*._-RC_) and create a new release commit

```bash
lerna publish --skip-npm --force-publish
```

-   [ ] Use a text editor to do a find-and-replace-in-project for the old version to make sure that there's not extra references to the old version number lying around - we want to automate this whereever possible but it happens. If anything needed changing, use `git commit --amend` to make it part of the release commit.

-   [ ] Build everything

```bash
lerna run build --include-filtered-dependencies
```

-   [ ] Build docker images for everything that needs it

```bash
lerna run docker-build-prod --include-filtered-dependencies
```

### Publish to dev

-   [ ] Connect to the dev cluster

```bash
kubectl config use-context <dev-cluster-name>
```

If you don't know the dev cluster name, use `kubectl config get-contexts`. If you've never connected to the dev cluster, go to the GKE page of google cloud and get the script to connect yourself.

-   [ ] Run a helm upgrade to put dev on your new version

```bash
helm upgrade magda --timeout 999999999 --wait --recreate-pods -f deploy/helm/magda-dev.yml deploy/helm/magda
```

-   [ ] Generate jobs files, deploy them and make sure they run ok

```bash
cd deploy
yarn run create-connector-configmap
yarn run generate-connector-jobs-dev
mkdir kubernetes/generated/prod/cron
mv kubernetes/generated/prod/*-cron.json kubernetes/generated/prod/cron
kubectl apply -f kubernetes/generated/prod/cron
cd ..
```

-   [ ] Do a smoke test on dev to make sure everything works ok. If it works go to the next step, otherwise:
    -   Fix it
    -   Commit the changes
    -   Do another `lerna publish --skip-npm --force-publish`, bumping the RC number by 1.
    -   Rebuild/push the affected images

### Publish to prod

-   [ ] Connect to the prod cluster

```bash
kubectl config use-context <prod-cluster-name>
```

-   [ ] Helm upgrade prod

```bash
helm upgrade magda --timeout 999999999 --wait --recreate-pods -f deploy/helm/search-data-gov-au.yml deploy/helm/magda
```

-   [ ] Look at the logs on magda-registry and the webhooks table of the database to make sure it's processing webhooks again

```
kubectl logs -f <registry-api-pod-name>
kubectl port-forward <cloud-sql-proxy-pod-name> 5432:5432
```

-   [ ] Generate/deploy new cron jobs

```bash
cd deploy
yarn run create-connector-configmap
yarn run generate-connector-jobs-prod
mkdir kubernetes/generated/prod/cron
mv kubernetes/generated/prod/*-cron.json kubernetes/generated/prod/cron
kubectl apply -f kubernetes/generated/prod/cron
cd ..
```

-   [ ] Do a smoke test on prod to make sure everything works ok. If it works go to the next step, otherwise:
    -   Fix it
    -   Commit the changes
    -   Do another `lerna publish --skip-npm --force-publish`, bumping the RC number by 1.
    -   Rebuild/push the affected images
    -   Restart the process starting from the dev deploy
    -   Do a post-mortem so this doesn't happen again. Things going wrong in dev is ok, but they shouldn't break in prod!

### Publish new version to git

-   [ ] Push the new release tag and branch

```bash
git push origin <version>
git push origin v<version>
```

-   [ ] Merge the release branch into master

```bash
git checkout master
git pull
git checkout -b merge-<version>
git pull origin <version branch> -s recursive -X ours
git push origin merge-<version>
```

... and open a PR. Be careful - any conflicts will be resolved by taking masters version, which sometimes causes lerna config to get clobbered - double check!

### Create new pre-release version, publish to dev and push to git

-   [ ] Checkout master

```bash
git checkout master
git pull
```

-   [ ] Use lerna to create a new pre-patch version

```
lerna publish --force-publish --skip-npm
```

-   See "Publish to dev" for publishing instructions

### Push the latest RC of last version as a release

-   [ ] Check out last version's branch

```bash
git checkout <last version number>
```

-   [ ] Set the version number as an actual release version (no "-RCx") and push it to docker and github

```bash
git checkout <version branch>
lerna publish --skip-npm --force-publish
git push origin v<version>
lerna run build && lerna run docker-build-prod
```

-   [ ] Set that latest tag as a "release" in github.

-   [ ] Delete the version branch in github
