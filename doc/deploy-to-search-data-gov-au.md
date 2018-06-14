### Create a release branch

This should happen just before or after a complete QA of the system. During the test issues will be created for bugs found - if any are release blockers, the PRs that fix them should be based on this release branch. Anything else should be based on `master`.

*   [ ] Check out master and ensure you don't have any extra changes

```bash
git checkout master
git status
```

*   [ ] `git pull`

*   [ ] Check this out into a release branch

```
git checkout -b release/0.0.x
```

*   [ ] Run `lerna publish ` to bump the version number to a Release Candidate version (`v*.*.*-RC1)

```bash
lerna publish --skip-npm --skip-git --force-publish
```

*   [ ] Use a text editor to do a find-and-replace-in-project for the old version to make sure that there's not extra references to the old version number lying around. In particular update the prod config to point at this new version. Also make sure to change `deploy/helm/magda/Chart.yaml`.

*   [ ] Commit and push.

### Bump version in master
*   [ ] Run `lerna publish ` to bump the version number to a the next development version (x.x.x-0).

```bash
git checkout master
lerna publish --skip-npm --skip-git --force-publish
```

*   [ ] Use a text editor to do a find-and-replace-in-project for the old version to make sure that there's not extra references to the old version number lying around - we want to automate this whereever possible but it happens. Ensure that the prod config continues to point at a release version, but the dev config should point at the new version. Also make sure to change `deploy/helm/magda/Chart.yaml`.

*   [ ] Commit the changes and create a PR against `master` for the version bump.

### (When all release-blocker bugs resolved) Release the RC

*   [ ] Check out the release branch and make sure it's up to date, then tag it as an RC and push it.

```bash
git checkout release/x.x.x
git pull
git tag vx.x.x-RC1 # The "v" in the tag is very important!!
git push vx.x.x-RC1
```
    
    This will cause a slightly different build pipeline to run - it will automatically push images to docker hub with the current version as specified in the root package json and create a full preview at https://vx-x-x-rc1.dev.magda.io using those images.
    
*   [ ] Test https://vx-x-x-rc1.dev.magda.io

### Publish to prod

*   [ ] Connect to the prod cluster

```bash
kubectl config use-context <prod-cluster-name>
```

*   [ ] Helm upgrade prod

```bash
helm upgrade magda --timeout 999999999 --wait --recreate-pods -f deploy/helm/search-data-gov-au.yml deploy/helm/magda
```

*   [ ] Look at the logs on magda-registry and the webhooks table of the database to make sure it's processing webhooks again

```
kubectl logs -f <registry-api-pod-name>
kubectl port-forward <cloud-sql-proxy-pod-name> 5432:5432
```

*   [ ] Generate/deploy new cron jobs

```bash
cd deploy
yarn run create-connector-configmap
yarn run generate-connector-jobs-prod
mkdir kubernetes/generated/prod/cron
mv kubernetes/generated/prod/*-cron.json kubernetes/generated/prod/cron
kubectl apply -f kubernetes/generated/prod/cron
cd ..
```

*   [ ] Do a smoke test on prod to make sure everything works ok. If it works go to the next step, otherwise:
    *   Fix it
    *   Commit the changes
    *   Do another `lerna publish --skip-npm --force-publish`, bumping the RC number by 1.
    *   Rebuild/push the affected images
    *   Restart the process starting from the dev deploy
    *   Do a post-mortem so this doesn't happen again. Things going wrong in dev is ok, but they shouldn't break in prod!

### Publish new version to git

*   [ ] Push the new release tag and branch

```bash
git push origin <version>
git push origin v<version>
```

*   [ ] Merge the release branch into master

```bash
git checkout master
git pull
git checkout -b merge-<version>
git pull origin <version branch> -s recursive -X ours
git push origin merge-<version>
```

... and open a PR. Be careful - any conflicts will be resolved by taking masters version, which sometimes causes lerna config to get clobbered - double check!

### Create new pre-release version, publish to dev and push to git

*   [ ] Checkout master

```bash
git checkout master
git pull
```

*   [ ] Use lerna to create a new pre-patch version

```
lerna publish --force-publish --skip-npm
```

*   See "Publish to dev" for publishing instructions

### Push the latest RC of last version as a release

*   [ ] Check out last version's branch

```bash
git checkout <last version number>
```

*   [ ] Set the version number as an actual release version (no "-RCx") and push it to docker and github

```bash
git checkout <version branch>
lerna publish --skip-npm --force-publish
git push origin v<version>
lerna run build && lerna run docker-build-prod
```

*   [ ] Set that latest tag as a "release" in github.

*   [ ] Delete the version branch in github
