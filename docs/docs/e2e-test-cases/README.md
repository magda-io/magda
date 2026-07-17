# E2E Test Cases

Concrete, repeatable end-to-end test cases for specific Magda features, run
against a real cluster (e.g. minikube). Most are API-level and build on the
shared setup in
[Feature-specific testing through the gateway with an API key](../e2e-cluster-deployment-test.md#feature-specific-testing-through-the-gateway-with-an-api-key)
(expose the gateway to the host, then authenticate with an API key — optionally
as a purpose-built test user). Some cases exercise a different surface (the mgd
CLI, an agent skill, or the Web UI) and document their own local setup.

Each case is self-contained: it lists what it verifies, how to run it (prefer a
scripted, assertion/checksum-based driver), and how to clean up.

## Cases

- [Large file storage (multipart upload + Range download)](./large-file-storage.md)
- [mgd CLI (auth, search, dataset/dist CRUD, large-file round-trip)](./mgd-cli.md)
- [mgd agent skill auto-use](./mgd-skill-auto-use.md)
- [Distribution version aspect in the Web UI](./distribution-version-web-ui.md)

## Adding a new case

- Add a `*.md` file here describing the case and (ideally) referencing a scripted
  driver checked into the relevant component.
- Link it from this index and, if broadly useful, from
  [End-to-End Full Cluster Deployment Test](../e2e-cluster-deployment-test.md).
- Reuse the shared gateway + API-key setup rather than repeating it; only document
  what's specific to the feature under test.
