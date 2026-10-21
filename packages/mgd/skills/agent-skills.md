# Reusable MAGDA Agent Skills with `mgd`

Use this reference when the task is to **draft, validate, publish, inspect,
download, delete, share, install or synchronize** a Registry-backed Agent
Skill. These are
persistent user/system publications distinct from ordinary dataset operations
and from the bundled `magda-mgd` guidance installed by `mgd skills install`.

Read the core [`SKILL.md`](./SKILL.md) first. Its auth, machine-output,
explicit-mutation-consent and error-handling rules still apply.

## Two different command families

- `mgd skills install [--agent <name>]` (and `uninstall`) installs/removes
  the **packaged `magda-mgd` instructions** in local coding-agent harnesses.
  It does not publish a ZIP or create Registry records.
- `mgd agent-skill ...` manages **published reusable skills**, via authenticated
  Magda Agent Services and the current profile/account.

Published **user** skills contain Markdown only and are ordinarily owned by
their intended user. Published **system** skills may include regular supporting
files/scripts and require dedicated system-publishing authority. Both must
respect the same explicit review-and-publish decision. A system publication
can be available to other authorised MAGDA users; do not describe it as
anonymous/public-internet access.

## Draft, validate and deliberately publish

```sh
mgd auth status --json
mgd agent-skill init clean-columns --type user --output ./clean-columns --json
# Edit ./clean-columns/SKILL.md and review its exact instructions with the user.
mgd agent-skill validate ./clean-columns --type user --json
# Only after explicit approval of this specific reviewed draft:
mgd agent-skill publish ./clean-columns --type user --json
```

`init`, editing, `validate`, `list`, `show`, and `pull` **do not publish**.
Ask for the user's approval before publishing a new/revised skill. Do not
interpret mere success of an unrelated workflow as authorization to publish.
Never bypass an Agent Services authorization denial using direct Registry or
Storage API calls.

For a reusable system publication, choose a permitted `system-<suffix>` name,
set `--type system` consistently, explain wider authorised-user visibility
before the single publication approval, and allow the backend typed OPA check
to decide. Runtime-bundled skills such as `capture-workflow` are
deployment-owned and cannot be overwritten as user publications.

## Discover, inspect or pull an existing publication

```sh
mgd agent-skill list --type all --limit 20 --json
mgd agent-skill show user/agent-skill-<user-uuid>-clean-columns --json
mgd agent-skill pull user/agent-skill-<user-uuid>-clean-columns -o ./review-copy --json
```

Read the CLI's returned `nextPageToken` to continue list pagination.
A pulled directory is a **working copy**, not an automatically installed skill.
It records verified source-account/ETag provenance for safe later publication.
Do not delete or overwrite an existing local directory as part of a pull.

## Sharing and installing shared skills

Sharing and installing are separate, explicit steps, and both are mutations
that need the user's go-ahead in this conversation:

```sh
# The owner shares one published user skill with another MAGDA user (UUID from
# their Account page). This grants read access only; nothing is installed.
mgd agent-skill share user/agent-skill-<my-uuid>-clean-columns <user-uuid> --json
mgd agent-skill recipients user/agent-skill-<my-uuid>-clean-columns --json
mgd agent-skill unshare user/agent-skill-<my-uuid>-clean-columns <user-uuid> --json

# A recipient discovers what is shared with them, then explicitly installs it.
mgd agent-skill list --shared --json
mgd agent-skill install user/agent-skill-<publisher-uuid>-clean-columns --json
mgd agent-skill install user/agent-skill-<publisher-uuid>-clean-columns --as team-columns --json
mgd agent-skill installations --json
mgd agent-skill uninstall team-columns --json
```

- A shared skill is **not installed automatically**; only `install` (or
  Settings > Agent Workspace > Shared Skills) adds it to the recipient's
  skills. Installing copies nothing locally until the next `sync`.
- Installed names share the recipient's namespace with their own
  publications. On a name conflict the error suggests an alias; rerun with
  `--as <name>`. Renaming means uninstall and install again.
- Uninstalling removes only the recipient's installation; the publisher's
  skill is never changed. A source whose sharing was revoked or which was
  deleted stays listed as unavailable until it is uninstalled.
- System skills are not installed this way. Their access (Public skill,
  organisation, selected users) is managed by authorised system skill
  managers with `mgd agent-skill access system/<id> [--public|--no-public] [--org-unit <id>|--clear-org-unit]` plus `share`/`unshare`. Public means
  available to users with a suitable system-skill read permission, never
  anonymous access. Access paths are additive.

## Publication replacement and deletion safety

A publication has an immutable type, identity and skill name. Renaming requires
a new publication, not silently changing `SKILL.md` name on replacement.
Publishing a previously installed own copy or a pulled working directory
targets its **recorded original MAGDA account**, not blindly the currently
selected profile. It must authenticate as the same instance, tenant and user,
or it refuses to publish.

Normal replacement/deletion uses the recorded checksum (`If-Match`).
If another actor has changed the publication, stop and show the conflict.
`publish --force` or `delete --force` is a deliberate overwrite/destruction
decision and needs explicit user consent. Never use it as an automatic fix.
For installed system skills, pull to a separate working directory and use the
appropriate system type; do not try to publish the installed copy directly.

An installed copy of a skill **shared by another user** is never published
back to that user's skill. Plain `publish` refuses (error code
`SHARED_INSTALLATION_FORK_REQUIRED`) and explains that `publish --force`
would publish the edited copy as the recipient's **own** user skill (a fork)
in place of their installation. Only with the user's explicit consent to that
fork, run `mgd agent-skill publish <installed-dir> --force --json`. It uses
the recipient account recorded in the copy, never another active profile. If
it reports that the installation was removed but the publication was not
created yet, the local files are unchanged: rerun the same command to finish.
Other installed copies update at their next sync.

```sh
# Only after confirming the correct exact publication and deletion intent:
mgd agent-skill delete user/agent-skill-<user-uuid>-clean-columns --json
```

If a write fails with `outcome: "unknown"` (timeout, lost connection or a
server response after sending), the server **may already have committed it**.
Do **not** retry the write blindly. When the API is reachable, inspect the
specific `type/id` with `mgd agent-skill show` and compare the intended
checksum/state; report unresolved ambiguity honestly. A confirmed HTTP 4xx
rejection and `outcome: "not-sent"` are different outcomes. A successful remote
write followed by a local-cache failure is still a remote success.

## Reconcile installed skill copies

```sh
mgd agent-skill sync --json
# Only with explicit consent to discard conflicting local edits:
mgd agent-skill sync --force --json
```

On a local computer, ordinary sync installs the current profile's **own
user publications and explicitly installed shared skills** into detected
Claude Code, Codex, OpenCode and configured DSH roots. It does **not**
automatically install system skills or someone else's merely readable
publications. Use explicit `pull system/<id>` to inspect a system publication.
In the Magda-hosted Agent Workspace, the trusted runtime also reconciles the
system skills available to the user.

When a shared skill's source is revoked or deleted, a successful sync removes
clean installed copies and reports `INSTALLATION_SOURCE_UNAVAILABLE` with a
nonzero exit until the installation is uninstalled. Edited copies are kept as
conflicts until `sync --force`. Revocation stops future access; it cannot
instantly erase copies already on a computer.

Installed skills are **independent real-directory copies** with a root-level
`.magda-skill-install.json` marker (provenance, baseline, no credentials).
Local edits belong to that copy. Normal sync keeps conflicting edits and
reports them; a missing eligible skill is reinstalled, matching content can
have metadata repaired, and clean obsolete managed copies can be removed.
A local conflict blocks **only that skill**: independent clean operations
proceed and return a partial/nonzero result.

Before any **online** installation changes, sync must successfully authenticate
the entire remote manifest and verify **every required current ZIP** against
its checksum. On outage, warning, unavailable ZIP or failed validation it
must abort without modifying installed skills, even with `--force`, and
preserve the last verified snapshot. Never substitute an older cached ZIP
for a desired newer release. `--force` does not bypass path safety,
authentication or archive verification.

An installed skill may come from a different profile. Changing the active
profile with `mgd profile use <name>` commits the new selection first and
then reconciles its **previously verified offline** cache. A conflict can
leave an old-profile copy visible while reporting a nonzero result; it does
not roll back the selected profile. Explicit `--sync-skills` adds network sync.
Do not infer an empty desired set from an uncached profile.

The Manager's hidden `--workspace-status` flag is reserved for trusted
root-provisioned Agent Workspaces; agents should not use it as a way to change
Manager-owned status. Normal manual Sandbox sync may change skill directories
without updating the MAGDA page's last-run summary. When that summary shows
`partial`/`failed`, the Settings **Retry / Re-check** control asks for
confirmation before requesting a separate Manager-controlled forced sync.

## Response checklist

Report the account/profile involved, exact skill `type/id/name`, files
created/reviewed, whether a remote publication succeeded, any checksum or
account conflict, and whether local harness copies were updated. Never claim
a successfully published skill has automatically propagated to all local or
running Workspace copies.
