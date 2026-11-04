# Agent Skill sharing and recipient authorization E2E

**Purpose:** Reproducible end-to-end test of merged #3864's source grants, explicit installations, aliases, conflict/revocation and fork behaviour. This case tests implementation behaviour; [product acceptance #3866](https://github.com/magda-io/magda/issues/3866) separately assesses meaningful skill reuse.

**Setup:** Run the [Agent Workspace Minikube setup](./agent-workspace.md#prerequisites) on a feature-enabled `next` build. Use distinct disposable MAGDA users and **their own** profiles/API keys. Record image digests and commit under test. Use synthetic skill inputs, sanitised identifiers and no real private datasets. Clean up only fixture-owned users, groups, installations and publications.

## Publication, installation and revocation matrix

Use two non-admin users holding only **Agent Workspace Users**, called Alice
(publisher) and Bob (recipient), an unrelated non-admin Carol with the same
role, a user Dave holding only the typed user-read permissions (no install
permission), and an **Agent Skills Admins** user for system access. Create
them and their API keys through `/v0/public/{users,roles,…}` with a
short-lived admin JWT, as described in [Workspace access checks](#workspace-access-checks),
and remove them afterwards. Run each user's `mgd` with its own profile; never
share credentials between profiles.

1. **Private by default.** Alice publishes `csv-reporter`. Bob's
   `mgd agent-skill list --shared` and **Shared Skills / All available** are
   empty; `mgd agent-skill show user/<alice-skill-id>` and the archive download
   return `404`, and `install` returns `404 AGENT_SKILL_SOURCE_NOT_FOUND`.
2. **Share.** Alice runs `mgd agent-skill share user/<id> <bob-uuid>` (or
   **Share** on the Agent Skills card). Settings > Access Groups shows one
   "Agent Skill share" group with resource `object/agentSkill/user`, a single
   `object/agentSkill/user/read` operation and Bob as the only member; the
   publication's `access-control.preAuthorisedPermissionIds` contains exactly
   that group's permission ID.
3. **Readable, not installed.** Bob now sees the skill (with Alice as the
   publisher) and can show and download it. His `local-sync-manifest` and
   `workspace-manifest` contain no installation item.
4. **Install.** Bob first publishes his own `csv-reporter`. Installing
   Alice's then returns `409 AGENT_SKILL_NAME_CONFLICT` with a suggested alias,
   and the UI opens the alias prompt prefilled with it; Bob installs it under
   that alias. **Installed** lists the installation; the Registry record has
   `agent-skill-installation`, Bob as owner and no `agent-skill` aspect, and
   Storage has no new object. Repeating the install returns `200` without a
   second record.
5. **Sync both ways.** Bob's local `mgd agent-skill sync` installs a real copy
   in each detected harness; with an alias, only the `name:` line of `SKILL.md`
   differs from the ZIP, and the marker has `kind: "installation"`, the
   installation ID, the alias and Alice's archive checksum. In Bob's Workspace,
   **Retry / Re-check** (or a fresh Workspace) installs the same copy in the DSH
   root and the agent can use it.
6. **Publisher update.** Alice publishes v2. Bob edits one harness copy. Bob's
   next sync updates the clean copies and reports only the edited one as
   `LOCAL_MODIFICATION` (partial); `sync --force` replaces it.
7. **Revocation.** Alice removes Bob (confirmation dialog). Bob can no longer
   show or download the source (`404`/`403`), the manifest lists the
   installation under `unavailableInstallations`, a successful sync removes
   clean copies and reports `INSTALLATION_SOURCE_UNAVAILABLE`, and an edited
   copy stays as `NOT_DESIRED_LOCAL_MODIFICATION` until `sync --force`.
   **Installed** shows the source as no longer available, without publisher
   details.
8. **Dangling uninstall.** Bob uninstalls it (confirmation dialog, or
   `mgd agent-skill uninstall <name>`). Alice's record and ZIP are unchanged
   (same checksum), and Bob's next sync succeeds.
9. **Fork.** Alice shares again; Bob installs, edits his copy, and runs
   `mgd agent-skill publish <copy>`, which refuses with
   `SHARED_INSTALLATION_FORK_REQUIRED`. `publish <copy> --force` creates
   `user/agent-skill-<bob-uuid>-<name>` owned by Bob and removes his
   installation; only that copy's marker is rebound and other harness copies
   update at the next sync. Alice's record, permissions and ZIP checksum are
   unchanged. With Bob's active profile switched to another account the fork
   still authenticates as Bob; with no valid Bob profile it refuses without a
   request.
10. **Negative matrix.** Carol cannot see, show, download, install, share or
    fork Alice's skill, nor list, read or uninstall Bob's installation. Bob
    cannot change Alice's sharing (`404`). Dave can read a skill shared with
    him but `install` returns `403 AGENT_SKILL_INSTALL_FORBIDDEN`. A user from
    another tenant cannot obtain the source. Through the generic Registry API, a
    constrained `object/record` grant reads no installation or shared source,
    and only admins and unconstrained generic grants can write an
    installation. Install request bodies with
    `userId`, `ownerId` or `id`, malformed IDs, system sources, `system-` or
    runtime-bundled aliases are rejected.
11. **Outage.** Stop the Registry or OPA briefly, or make Alice's source
    PENDING: Bob's sync (even `--force`) fails before any change; nothing is
    removed.
12. **System skill access.** As an Agent Skills Admin, open **Manage access**
    for a system skill: **Public skill** is checked by default with help text
    that it is not anonymous. Select an OrgUnit and add Bob, then uncheck Public
    and save: Bob still reads it, Carol does not, and the OrgUnit and Bob are
    kept when Public is checked again. An Agent Workspace User sees no
    **Manage access** button and the API returns `404`.

## Independent model-data permission gate (additional product acceptance)

The generic `csv-reporter` assertions above do **not** prove that sharing a skill leaves its supporting datasets protected. Extend the case with a synthetic, versioned approved model dataset, its independently readable inference distributions and separately restricted training observations:

| Actor/action | Expected outcome | Evidence to record |
| --- | --- | --- |
| Publisher reads own source and training data | Allowed when properly granted | Caller-scoped catalogue/download checks |
| Recipient sees shared source before install | Allowed source read but **no manifest install** | Shared Skills and manifest |
| Recipient explicitly installs prediction skill | Allowed only with install/create and source read | Recipient installation ID, alias, checksum |
| Recipient reads approved model/inference resources | Allowed only through **separate dataset/distribution grants** | Source dataset IDs, response codes, checksum and reproduction |
| Recipient reads private training data | **Denied**, even though skill install succeeded | Authenticated negative query and direct distribution fetch status |
| Third-party user tries source or recipient installation | Denied | Typed API/Registry tests |
| Source grant revoked | Future source resolution denied; installation remains uninstallable | Manifest/unavailable status, next reconciliation result |

Never reuse the publisher's `mgd` profile/credentials to run recipient checks. Confirm source and model distribution authorization separately; success of a prediction alone does not establish a denial of private data. Use a trusted independent verifier for numerical outputs where relevant.

## Result record and cleanup

Record build/commit, fixture generator version, roles and permission matrix, each positive/negative request and result, archive/model checksums, sync state and cleanup evidence. Mark a behavioural result **observed** only after executing it. Any mismatch is a reproducible MAGDA issue; no private video or personal repository URLs belong in public test logs.
