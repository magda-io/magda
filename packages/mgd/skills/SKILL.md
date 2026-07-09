---
name: magda-mgd
description: Use when accessing a MAGDA data catalog from the command line — searching/downloading datasets, analysing them locally, or creating/editing dataset records and uploading files via the mgd CLI.
---

# MAGDA `mgd` CLI skill

Read `mgd-workflows.md` (same directory) for command usage, output modes,
search strategy, recipes, safety rules, and error triage. Follow its ground
rules for every MAGDA interaction.

When creating or editing datasets (metadata conversations), additionally
follow `dataset-elicitation.md` — it defines the consultant behavior: infer
before asking, quick path vs guided path, purpose-driven field suggestions,
and the confirm-then-write discipline.

Locate the skill files via the installed package: `npx @magda/mgd --version`
confirms the CLI; the Markdown files ship in the package's `skills/` folder
(e.g. `$(npm root -g)/@magda/mgd/skills/` for global installs).
