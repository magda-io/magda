# Testing a PR with a Preview Release Before Merging

CI (unit tests, integration tests, `helm template` validation) does not cover everything. It does not publish real Docker images / NPM packages / Helm charts through the actual release pipeline, and it does not deploy the result to a real Kubernetes cluster. Bugs that only show up in those two places — a broken publish step, a chart that fails to install, a Pod that crash-loops at runtime — can pass CI and merge cleanly, then only surface once someone (or an automated job) tries to actually use the release.

For any non-trivial change to release tooling (`.gitlab-ci.yml`, `package.json` `release`/`build` scripts, Helm chart templates/values, GitHub Actions workflows) or to code exercised only at runtime (CronJobs, startup ordering, headers/middleware), cut a **PR testing build** and deploy it before merging. This is the same release pipeline a production release uses, just from your PR branch with a `pr` pre-release tag, so it exercises the real Docker/NPM/Helm publish path without affecting `latest`/`main`.

This doc covers the practical, iterate-until-green workflow. For the full mechanics of cutting any kind of release (branch naming, version format, GitHub Actions `set-version` workflow, GitLab pipeline stages), see [How to Release a New Version](./ci-version-release.md) — this doc assumes you've read the "PR Testing Builds" section there.

## Workflow

1. **Cut a PR testing release.** From your PR branch, create `release/v<MAJOR>.<MINOR>.<PATCH>-pr.<PR_NUMBER>.0` and run the `set-version` workflow, per [How to Release a New Version](./ci-version-release.md#step-1-create-a-release-branch). Create a GitHub Release/tag targeting that branch, marked as a pre-release.
2. **Monitor the GitLab pipeline to completion.** Pay particular attention to the `release` stage jobs (`Publish NPM Packages`, `Release-to-Docker-Hub-Github-Container`, `Publish Helm Chart`) — these are the jobs CI on the PR branch itself never runs.
3. **Verify the published artifacts**, not just that the pipeline went green:
   - NPM: `npm view @magda/typescript-common versions --json` / `dist-tags --json` — confirm your version is present with the expected dist-tag (prerelease versions must not land on `latest`).
   - Helm: `helm show chart oci://ghcr.io/magda-io/charts/magda --version <VERSION>` — confirm the chart pulls.
   - Docker: spot-check an image tag exists under `ghcr.io/magda-io/`.
4. **Deploy the build and run a full E2E cluster test.** See [End-to-End Full Cluster Deployment Test](./e2e-cluster-deployment-test.md). A green pipeline does not guarantee a working deployment — Helm install failures, CrashLoopBackOff, and CronJob failures only show up once something is actually running.
5. **If you find a bug:** fix it on the PR branch, bump the build number (`.1`, `.2`, ...), and cut a new release branch + tag from the updated PR branch. Don't reuse a build number or push fix commits onto an existing `release/*` branch — those branches are meant to contain only the version-bump commit from `set-version`, nothing else. Cherry-pick any fix made directly on a release branch (for expedience mid-investigation) back onto the PR branch so it isn't lost.
6. **Once a build passes both the pipeline and the E2E cluster test, merge the PR.**
7. **Clean up.** Delete the `release/v*-pr.*` branch(es) created during testing:
   ```bash
   git push origin --delete release/v6.0.0-pr.248.0
   ```
   The GitHub Release/tag can be left in place as a historical record of what was tested, or deleted — team preference. Note that NPM does not allow republishing a version once published, so a `pr` build number is "burned" the moment its `Publish NPM Packages` job succeeds, even if you later delete the branch/tag.
