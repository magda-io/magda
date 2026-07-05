# How to update Helm chart docs (helm-docs)

Each Magda Helm chart's `README.md` is **auto-generated** from the chart's
`values.yaml` (using the `# --` value comments), `Chart.yaml`, and the chart's
`README.md.gotmpl` template, via [helm-docs](https://github.com/norwoodj/helm-docs).
**Do not hand-edit a chart `README.md`** — edit the source (`values.yaml` /
`Chart.yaml` / `README.md.gotmpl`) and regenerate.

> CI enforces this. If a chart `README.md` is out of date relative to its
> sources, the `buildtest:helm-docs-check` job fails the pipeline (see below).
> So whenever you change a chart's `values.yaml`, `Chart.yaml`, or
> `README.md.gotmpl`, you must regenerate and commit the `README.md`.

## When you need to run it

Any change to a chart under `deploy/helm/**` that affects generated docs, most
commonly:

- adding / removing / renaming a value in `values.yaml`, or editing its `# --`
  doc comment or default;
- changing `Chart.yaml` metadata (description, version, dependencies);
- editing a chart's `README.md.gotmpl`.

## How to regenerate

From the repository root (requires Docker; matches the version CI uses,
`helm-docs` v1.13.1):

```bash
cd deploy
yarn helm-docs
```

`yarn helm-docs` runs the pinned helm-docs Docker image over the repo and
regenerates every chart `README.md` from its sources. Only charts whose sources
changed will show a diff. Review the changes and commit the updated `README.md`
file(s):

```bash
git status                 # see which README.md files changed
git add deploy/helm/**/README.md
```

(There is also `yarn add-all-helm-docs-changes`, which runs helm-docs and
`git add`s the changed `README.md` files in one step. The `version` script runs
it automatically during a release.)

## How CI checks it

`buildtest:helm-docs-check` in `.gitlab-ci.yml` runs helm-docs (v1.13.1) and then
checks whether any `README.md` became modified:

```
git ls-files -m | grep -i readme.md
```

If any chart `README.md` is modified after regeneration, the docs were stale and
the job fails with a message asking you to run helm-docs and commit the result.
So a clean run locally (no `README.md` diffs after `yarn helm-docs`) means CI
will pass.

## Writing good value docs

The quality of the generated table comes from the `# --` comments above each
value in `values.yaml`, e.g.:

```yaml
# -- the file upload size limit of the storage API
uploadLimit: "100mb"
```

Keep these comments accurate and concise — they are what users read in the
published [Helm Chart Reference](./helm-charts-docs-index.md).
