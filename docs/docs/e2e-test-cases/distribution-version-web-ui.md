# E2E Test Case: Distribution version aspect in the Web UI

Verifies the web-client side of the application-managed `version` aspect
([#3713](https://github.com/magda-io/magda/issues/3713); the mgd CLI side is
[#3687](https://github.com/magda-io/magda/issues/3687)). Because this behaviour
lives in the browser — the dataset editor's submit flow and the distribution
page's version rendering — it is verified by driving the **actual Web UI**
against a real cluster, not just the API.

Unlike the API-key/gateway cases in this folder, this case runs the **local
web-client dev build** against the cluster, authenticated with the
[Quick local UI check without a real login (JWT-injecting dev proxy)](../e2e-cluster-deployment-test.md#quick-local-ui-check-without-a-real-login-jwt-injecting-dev-proxy)
recipe — no auth plugin, cert-manager, HTTPS or `sudo` required. (That is a
testing shortcut that bypasses real auth; it does not exercise the browser login
path, which is fine here since we only need an authenticated session.)

## What it covers

- Editing a distribution's metadata (e.g. its title) in the dataset editor and
  submitting bumps **that distribution's** `version` aspect: `currentVersionNumber`
  increments, a new item with `description: "Distribution metadata updated"` is
  appended, and it is tagged with the registry `x-magda-event-id` of the submit.
- Re-submitting a session that did **not** edit the distribution does **not**
  create a spurious new version (the per-distribution edit flag is cleared after
  a successful submit).
- The distribution details page renders the full **Version History** list, and
  each "Version N" link navigates to `?version=N` and reconstructs that version's
  metadata via the registry time-travel API.

## Setup

1. Bring up the local Web UI against the cluster with the
   [Quick local UI check without a real login (JWT-injecting dev proxy)](../e2e-cluster-deployment-test.md#quick-local-ui-check-without-a-real-login-jwt-injecting-dev-proxy)
   recipe (port-forward the gateway, mint the admin JWT, add the throwaway
   `setupProxy.js` + `config.ts` edit, `yarn start`). The UI at
   <http://localhost:6108> is then authenticated as admin.
2. Get an API key for the [mgd CLI](./mgd-cli.md) (used below for setup and
   verification) via
   [Bootstrap an admin API key](../e2e-cluster-deployment-test.md#2-bootstrap-an-admin-api-key-jwt-used-only-to-create-the-key),
   then `export MGD_BASE_URL=http://localhost:18080/api`, `MGD_API_KEY_ID=…`,
   `MGD_API_KEY=…`.

## Test steps

1. **Create a distribution with a tagged v0:**

   ```bash
   DS=$(mgd dataset create --title "3713 UI test" --publish)
   printf 'a,b\n1,2\n' > /tmp/d.csv
   DIST=$(mgd dataset add-file "$DS" /tmp/d.csv --title "original.csv" --json | jq -r .distributionId)
   mgd dataset aspect get "$DIST" version   # currentVersionNumber 0, versions[0].eventId set
   ```

2. **Metadata edit bumps the version.** In the UI open
   `http://localhost:6108/dataset/edit/$DS`, click **Edit distribution metadata**,
   change the title, click **Save**, then **Review & Submit** → **Submit dataset
   changes**. Verify:

   ```bash
   mgd dataset aspect get "$DIST" version
   # expect: currentVersionNumber 1; versions[1].description "Distribution metadata updated";
   #         versions[1].title = the new title; versions[1].eventId set
   ```

3. **No spurious bump.** Reload `http://localhost:6108/dataset/edit/$DS/5` and click
   **Submit dataset changes** again **without** editing the distribution. Verify the
   distribution version is **still 1** (the edit flag is cleared after a successful
   submit).

4. **Version list + navigation.** Optionally add more versions
   (`mgd dist update "$DIST" --title title-vN.csv --desc "…"`, repeat), then open
   `http://localhost:6108/dataset/$DS/distribution/$DIST/details`. Verify the
   **Version History** section lists every version (newest first, the current one
   marked "Current Version"), and that clicking **Version N** navigates to
   `…/details?version=N`, marks it "Selected Version", and renders that version's
   reconstructed metadata (e.g. the title/description as they were at that version).

## Cleanup

```bash
mgd dist remove "$DIST"                                   # deletes the distribution + its stored file
mgd api request DELETE "/v0/registry/records/$DS"         # deletes the dataset
# revoke the API key you created; stop `yarn start` and the `kubectl port-forward`
git checkout -- magda-web-client/src/config.ts            # undo the fallbackApiHost edit
rm magda-web-client/src/setupProxy.js                     # remove the throwaway proxy
```
