# E2E test case: `mgd` coding-agent skill global auto-use

**Purpose:** Verify that, after installing the locally built `mgd` CLI and running
`mgd skills install` (which installs the skill **globally** for all agents), each
supported coding agent (**Claude Code**, **Codex**, **opencode**) **auto-uses** the
skill — discovers and runs `mgd` on its own — when asked a natural dataset question
**from an unrelated working directory** that contains no project-level skill and never
mentions "mgd" or "skill".

The "from an unrelated working directory" part is the point: the skill is installed
into each agent's global skills directory, so it must be discovered regardless of cwd.

Related: `mgd-cli.md` (CLI e2e), issue #3682, PR #3683.

## What "auto-use" means here

The prompt says nothing about `mgd`, the skill, or the site URL, and the agent is
launched from a clean directory with no local skill. A PATH **logging shim** records
every `mgd` invocation. Any `mgd` call during such a run means the agent discovered the
globally installed `SKILL.md` on its own — that is the signal we assert. All three
agents natively auto-discover `SKILL.md` skills; there is no per-tool wrapper.

## Prerequisites

- Node ≥ 22, `npm`, `yarn`.
- `claude`, `codex` on `PATH`; `opencode` at `~/.opencode/bin/opencode`.
- Each agent already authenticated to its own model provider (this test does not set
  that up). Codex sandboxes network by default, so its run uses
  `--sandbox danger-full-access`.
- Repo `.env` at the worktree root containing `API_KEY_ID` and `API_KEY` for
  `https://dev.magda.io`.
- **Read-only:** every prompt triggers search/get only — no create/update/publish.

## Isolation & safety

- `mgd` credentials are supplied via `MGD_*` environment variables, so **no mgd config
  file is read or written** — nothing to clean up in `~/.config/mgd`.
- The global skill install writes into each agent's real skills dir
  (`~/.claude/skills`, `~/.codex/skills`, `~/.config/opencode/skills`); these cannot be
  sandboxed the way a project install can, because each agent also reads its own auth
  from its real home. Teardown removes them with `mgd skills uninstall`.
- The only other global change is `npm link` of `@magda/mgd`, undone in teardown.
- All scratch files (shim, logs, the unrelated cwd) live under one `WORK` temp dir.

---

## Procedure

Shared variables (run from the repo/worktree root):

```sh
ROOT="$(git rev-parse --show-toplevel)"
WORK="$(mktemp -d /tmp/mgd-skill-test.XXXX)"
mkdir -p "$WORK/shim" "$WORK/cwd"          # cwd = clean, unrelated launch dir
OPENCODE_BIN="$HOME/.opencode/bin/opencode"
```

### Step 1 — Build and install `mgd` on PATH

```sh
( cd "$ROOT/packages/mgd" && yarn build && npm link )
REAL_MGD="$(command -v mgd)"
# Fallback: some non-interactive shells don't put the fnm global bin on PATH.
[ -n "$REAL_MGD" ] || REAL_MGD="$(npm prefix -g)/bin/mgd"
"$REAL_MGD" --version                      # expect a version line
echo "REAL_MGD=$REAL_MGD"
```

Expected: `mgd --version` prints a version. (The build now `chmod +x`es `bin/mgd.js`,
so the linked binary is executable.)

### Step 2 — Supply credentials via environment (no profile file)

```sh
set -a; . "$ROOT/.env"; set +a             # loads API_KEY_ID / API_KEY
export MGD_BASE_URL="https://dev.magda.io/api"
export MGD_API_KEY_ID="$API_KEY_ID"
export MGD_API_KEY="$API_KEY"
"$REAL_MGD" auth status --json             # expect authenticated:true
```

Expected: `auth status` shows the identity for the API key; with all three `MGD_*` set,
mgd reads/writes no config file.

### Step 3 — Install the skill globally (all agents)

```sh
"$REAL_MGD" skills install                 # all agents, global, by default
ls ~/.claude/skills/magda-mgd/SKILL.md \
   ~/.codex/skills/magda-mgd/SKILL.md \
   ~/.config/opencode/skills/magda-mgd/SKILL.md
```

Expected: `skills install` reports `created` for claude/codex/opencode (global); a
`SKILL.md` exists in each global dir.

### Step 4 — Install the logging shim ahead of the real `mgd`

```sh
cat > "$WORK/shim/mgd" <<EOF
#!/bin/sh
echo "\$(date -u +%FT%TZ) \$*" >> "$WORK/mgd-invocations.log"
exec "$REAL_MGD" "\$@"
EOF
chmod +x "$WORK/shim/mgd"
export PATH="$WORK/shim:$(dirname "$REAL_MGD"):$HOME/.opencode/bin:$PATH"
command -v mgd                             # expect $WORK/shim/mgd
```

Expected: `command -v mgd` resolves to the shim (which execs the real binary and logs).

### Step 5 — Drive each agent headless from the **unrelated** cwd

Prompt (identical for all three, mentions neither `mgd` nor the skill):

> Using the data catalogue, find a few datasets about rainfall and list their titles.

Reset the log before each run so calls are attributed per agent:

```sh
PROMPT="Using the data catalogue, find a few datasets about rainfall and list their titles."

: > "$WORK/mgd-invocations.log"
( cd "$WORK/cwd" && claude -p "$PROMPT" --allowedTools Bash ) \
  > "$WORK/out.claude.txt" 2>&1
cp "$WORK/mgd-invocations.log" "$WORK/log.claude.txt"

: > "$WORK/mgd-invocations.log"
( cd "$WORK/cwd" && codex exec --sandbox danger-full-access \
    --skip-git-repo-check "$PROMPT" < /dev/null ) \
  > "$WORK/out.codex.txt" 2>&1
cp "$WORK/mgd-invocations.log" "$WORK/log.codex.txt"

: > "$WORK/mgd-invocations.log"
( cd "$WORK/cwd" && "$OPENCODE_BIN" run "$PROMPT" < /dev/null ) \
  > "$WORK/out.opencode.txt" 2>&1
cp "$WORK/mgd-invocations.log" "$WORK/log.opencode.txt"
```

(The sandbox/permission flags are test-harness concessions so each agent may run `mgd`
non-interactively; adjust per agent if a run reports a blocked command. macOS has no
`timeout` — use `gtimeout` from coreutils, or rely on the agents terminating on their
own.)

### Step 6 — Assert auto-use

```sh
for a in claude codex opencode; do
  echo "=== $a ==="; cat "$WORK/log.$a.txt"; tail -6 "$WORK/out.$a.txt"
done
```

**PASS (per agent):** its log gained a `search`/`dataset` `mgd` call **and** its output
lists real dataset titles from dev.magda.io — proving it discovered the _global_ skill
from a directory with no local skill.
**FAIL / inconclusive:** no `mgd` call logged, or the agent answered without touching
the catalogue (e.g. fell back to web search) — capture transcript + log for diagnosis.

---

## Teardown / recovery

```sh
"$REAL_MGD" skills uninstall               # removes the 3 global skill dirs
( cd "$ROOT/packages/mgd" && npm unlink ) 2>/dev/null || true
npm rm -g @magda/mgd 2>/dev/null || true
command -v mgd || echo "mgd removed from PATH (expected)"
unset MGD_BASE_URL MGD_API_KEY_ID MGD_API_KEY
rm -rf "$WORK"
```

Expected end state: the three `magda-mgd/` global skill dirs removed; `mgd` no longer on
PATH; no mgd config written; temp dir gone.

## Results

Executed 2026-07-10 against `dev.magda.io` (mgd built from this branch;
`claude` 2.1.170, `codex` 0.144.1, `opencode` 1.17.18). Each agent was launched from a
clean unrelated directory (`$WORK/cwd`) with the verbatim prompt above — no mention of
`mgd`, the skill, or the site URL, and no local skill in cwd.

| Agent       | mgd auto-invoked (from unrelated cwd)?                                                       | Real titles? | Verdict  | Notes                                                                                                                                       |
| ----------- | -------------------------------------------------------------------------------------------- | ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | Yes — explored `mgd --help`, then `search datasets rainfall`                                 | Yes          | **PASS** | Discovered the global skill in `~/.claude/skills/magda-mgd`.                                                                                |
| Codex       | Yes — `auth status`, `search datasets`, `search semantic`, then a narrower `search datasets` | Yes          | **PASS** | This is the case that failed under the old project-scoped install; global install fixes it. Correctly reported semantic search unavailable. |
| opencode    | Yes — `auth status`, `search datasets`, `search semantic`                                    | Yes          | **PASS** | Discovered the global skill in `~/.config/opencode/skills/magda-mgd`.                                                                       |

**Outcome: all three agents auto-used the skill from an unrelated working directory** —
each discovered and ran `mgd` against dev.magda.io from a natural dataset question,
driven solely by the globally installed `SKILL.md`. Teardown removed the global skill
dirs, unlinked `mgd`, and left no mgd config behind (`MGD_*` env credentials).
