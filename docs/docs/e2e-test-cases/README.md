# E2E Test Cases

Concrete, repeatable end-to-end test cases for specific Magda features. They are
run against a real cluster (e.g. minikube) **through the gateway**, on top of the
shared setup described in
[Feature-specific testing through the gateway with an API key](../e2e-cluster-deployment-test.md#feature-specific-testing-through-the-gateway-with-an-api-key)
(expose the gateway to the host, then authenticate with an API key — optionally
as a purpose-built test user).

Each case is self-contained: it lists what it verifies, how to run it (prefer a
scripted, assertion/checksum-based driver), and how to clean up.

## Cases

- [Large file storage (multipart upload + Range download)](./large-file-storage.md)

## Adding a new case

- Add a `*.md` file here describing the case and (ideally) referencing a scripted
  driver checked into the relevant component.
- Link it from this index and, if broadly useful, from
  [End-to-End Full Cluster Deployment Test](../e2e-cluster-deployment-test.md).
- Reuse the shared gateway + API-key setup rather than repeating it; only document
  what's specific to the feature under test.
