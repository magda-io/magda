import {} from "mocha";
import { expect } from "chai";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { v4 as uuidV4 } from "uuid";
import ServiceRunner from "../ServiceRunner.js";

/**
 * Adversarial integration test for the PG13 -> PG17 logical major-upgrade
 * migration (`magda-postgres`'s `major-upgrade-dump-job.yaml` /
 * `major-upgrade-restore-job.yaml`).
 *
 * WHY THIS TEST EXISTS: a defect caught in review (and reproduced against a
 * real PostgreSQL 17.5 server -- see the restore template's own comments)
 * cannot be caught by any render test. `pg_dumpall --clean --if-exists`
 * emits `DROP ROLE IF EXISTS <connecting-role>;` / `CREATE ROLE
 * <connecting-role>;` for every role including the one the restore Job
 * connects as, and PostgreSQL refuses to drop its own connecting role. The
 * FIRST fix filtered those two literal lines from the ENTIRE dump stream
 * with `grep -vF -x`, which also deletes any `COPY ... FROM stdin` DATA row
 * that happens to equal one of those two strings verbatim -- a 3-row table
 * silently restores as 1 row, `psql` still exits 0, the Job still reports
 * success. The current implementation confines the filter to the globals
 * header (before the first `\connect`) with `awk`. This spec proves that
 * property holds against the REAL rendered script, with data engineered to
 * trigger exactly that failure mode, and is designed to fail loudly if the
 * property regresses.
 *
 * THIS TEST NEVER RE-IMPLEMENTS THE FILTER. It extracts the literal shell
 * script bodies from `helm template`'s output of the real
 * `deploy/helm/magda-core` chart (with `majorUpgrade.enabled=true`) and
 * executes THAT text, unmodified, inside real `postgres:13.7` /
 * `postgres:17.5` containers. A test containing its own copy of the awk
 * filter would pass even if the chart drifted away from it -- see the task
 * brief. If the chart's script logic ever changes, this test either keeps
 * passing because the property still holds, or fails because it doesn't;
 * it can never pass because of an out-of-date hardcoded copy.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// magda-int-test-ts/src/tests -> repo root
const REPO_ROOT = path.resolve(__dirname, "../../../");
const CHART_DIR = path.resolve(REPO_ROOT, "deploy/helm/magda-core");

const ENV_SETUP_TIME_OUT = 600000; // 10 mins

const runId = uuidV4().slice(0, 8);

// The dump Job's container is rendered from `.Values.postgresql.image`,
// i.e. byte-for-byte the same image as the NEW major's primary (see the
// header comment in major-upgrade-dump-job.yaml: "A PG17 client reading a
// PG13 server is the supported direction"). This test cannot pull Magda's
// own mirrored image in an isolated sandbox, so it substitutes the public
// image of the same major version the chart is pinned to on this branch --
// the same substitution walgBackupRestore.spec.ts already makes for its own
// postgres fixtures. Both the dump AND restore scripts run under this image,
// matching production (both Jobs use the NEW major's image).
const RUNNER_IMAGE = "postgres:17.5";
const SOURCE_IMAGE = "postgres:13.7";
const TARGET_IMAGE = "postgres:17.5";

const PGPASSWORD = "MajorUpgradeTest#1";
const OWNER_ROLE_PASSWORD = "OwnerRolePw#1";

// A value engineered to be adversarial for a line-based filter: unicode,
// an embedded single quote, an embedded double quote, a literal tab, and a
// backslash, all inside one COPY data field.
const WEIRD_TEXT =
    'unicode:世界café; single:it\'s; double:say "hi"; tab:[\t]end; backslash:[\\]end';

// --- small local helpers ---------------------------------------------------

/** Run the docker CLI, ignoring failures when `ignoreError` (best-effort cleanup). */
function docker(args: string[], ignoreError = false): string {
    const res = spawnSync("docker", args, {
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024
    });
    if (res.status !== 0 && !ignoreError) {
        throw new Error(
            `docker ${args.join(" ")} failed (exit ${res.status}):\n${
                res.stderr
            }`
        );
    }
    return (res.stdout || "").trim();
}

/**
 * Render `deploy/helm/magda-core` with the majorUpgrade mechanism enabled,
 * exactly as an operator crossing the PG13 -> PG17 boundary would. Throws
 * (hard failure, not a silently-empty string) if `helm template` fails or
 * produces no output.
 */
function renderChart(sourceHost: string): string {
    const args = [
        "template",
        "mu",
        CHART_DIR,
        "--set",
        "combined-db.magda-postgres.majorUpgrade.enabled=true",
        "--set",
        `combined-db.magda-postgres.majorUpgrade.sourceHost=${sourceHost}`,
        "--set",
        "combined-db.magda-postgres.majorUpgrade.waitTimeoutSeconds=90",
        // The official postgres images used below have no TLS listener
        // configured. This does not touch the role-filter logic under
        // test; it is the same supported value
        // (`global.postgresql.client.sslmode`) `useCloudSql` already uses
        // to get `disable` in production.
        "--set",
        "global.postgresql.client.sslmode=disable"
    ];
    const res = spawnSync("helm", args, {
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024
    });
    if (res.status !== 0) {
        throw new Error(
            `helm template failed (exit ${res.status}):\n${res.stderr}`
        );
    }
    if (!res.stdout || res.stdout.trim().length === 0) {
        throw new Error(
            "helm template produced empty output -- refusing to treat that as success"
        );
    }
    return res.stdout;
}

function splitDocs(rendered: string): string[] {
    return rendered.split(/\n---\n/);
}

/** The single top-level (metadata) value for `key`, or null. Matches at 0-2
 * leading spaces only, so it cannot pick up a same-named key nested deeper
 * (e.g. a container's own `name:`). Mirrors
 * deploy/helm/magda-core/tests/postgres-major-upgrade.sh's `top()`. */
function topField(doc: string, key: string): string | null {
    const re = new RegExp(`^\\s{0,2}${key}:\\s*"?([^"\\n]+?)"?\\s*$`, "m");
    const m = doc.match(re);
    return m ? m[1] : null;
}

/**
 * The literal block-scalar script body under `command:`'s `- |` entry.
 * Returns null if there is not exactly one `- |` marker in the document --
 * callers MUST treat that as a hard failure, not as "nothing to check".
 * Ported line-for-line from `postgres-major-upgrade.sh`'s Python
 * `extract_script`, which is the render test Task 16 already relies on.
 */
function extractScript(doc: string): string | null {
    const lines = doc.split("\n");
    const hits: number[] = [];
    lines.forEach((l, i) => {
        if (l.trim() === "- |") {
            hits.push(i);
        }
    });
    if (hits.length !== 1) {
        return null;
    }
    const i = hits[0];
    const markerIndent = lines[i].length - lines[i].trimStart().length;
    let contentIndent: number | null = null;
    const out: string[] = [];
    for (const line of lines.slice(i + 1)) {
        if (line.trim() === "") {
            out.push("");
            continue;
        }
        const indent = line.length - line.trimStart().length;
        if (contentIndent === null) {
            if (indent <= markerIndent) {
                break;
            }
            contentIndent = indent;
        }
        if (indent < contentIndent) {
            break;
        }
        out.push(line.slice(contentIndent));
    }
    return out.join("\n");
}

/** The literal `value:` of a plain (non-secretKeyRef) `env` entry named `name`. */
function extractEnvValue(doc: string, name: string): string | null {
    const re = new RegExp(
        `- name: ${name}\\r?\\n\\s*value:\\s*"?([^"\\n]*?)"?\\s*\\r?\\n`
    );
    const m = doc.match(re);
    return m ? m[1] : null;
}

function findSingleJobDoc(docs: string[], nameSuffix: string): string {
    const matches = docs.filter((d) => {
        const kind = topField(d, "kind");
        const name = topField(d, "name");
        return kind === "Job" && !!name && name.endsWith(nameSuffix);
    });
    if (matches.length !== 1) {
        throw new Error(
            `expected exactly one rendered Job ending in "${nameSuffix}", found ${matches.length} -- the render is not what this test assumes`
        );
    }
    return matches[0];
}

// Test-harness-only scaffolding: the dump/restore scripts unconditionally
// call `/usr/local/bin/adduser.sh` (present in Magda's bitnami-derived
// image, for arbitrary-uid support under OpenShift-style security
// contexts) which does not exist in the public postgres image substituted
// above. This prefix creates a no-op stub so the REAL script text -- which
// follows it completely unmodified -- can run. It touches nothing the role
// filter depends on.
const ADDUSER_STUB_PREFIX = [
    "mkdir -p /usr/local/bin",
    "cat > /usr/local/bin/adduser.sh <<'EOF'",
    "#!/bin/sh",
    "exit 0",
    "EOF",
    "chmod +x /usr/local/bin/adduser.sh",
    ""
].join("\n");

interface ScriptRunResult {
    status: number;
    stdout: string;
    stderr: string;
}

/** Run `script` (the REAL, extracted rendered script text) inside a
 * one-shot container, prefixed only with the adduser.sh stub above. */
function runRealScript(opts: {
    image: string;
    network: string;
    env: Record<string, string>;
    stagingVolume: string;
    script: string;
}): ScriptRunResult {
    const fullScript = ADDUSER_STUB_PREFIX + opts.script;
    const args = ["run", "--rm", "--network", opts.network];
    for (const [k, v] of Object.entries(opts.env)) {
        args.push("-e", `${k}=${v}`);
    }
    args.push("-v", `${opts.stagingVolume}:/staging`);
    args.push(opts.image, "bash", "-c", fullScript);
    const res = spawnSync("docker", args, {
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024
    });
    return {
        status: res.status ?? -1,
        stdout: res.stdout ?? "",
        stderr: res.stderr ?? ""
    };
}

function pgConfig(
    host: string,
    port: number,
    database: string
): pg.ClientConfig {
    return {
        host,
        port,
        user: "postgres",
        password: PGPASSWORD,
        database,
        connectionTimeoutMillis: 5000
    };
}

async function waitForPg(
    config: pg.ClientConfig,
    timeoutMs = 120000
): Promise<void> {
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const client = new pg.Client(config);
        try {
            await client.connect();
            await client.query("SELECT 1");
            await client.end();
            return;
        } catch (e) {
            try {
                await client.end();
            } catch {
                // ignore
            }
            if (Date.now() - start >= timeoutMs) {
                throw new Error(
                    `postgres at ${config.host}:${
                        config.port
                    } failed to accept connections in ${
                        timeoutMs / 1000
                    }s: ${e}`
                );
            }
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
}

async function withClient(
    host: string,
    port: number,
    database: string,
    fn: (c: pg.Client) => Promise<void>
): Promise<void> {
    const client = new pg.Client(pgConfig(host, port, database));
    await client.connect();
    try {
        await fn(client);
    } finally {
        await client.end();
    }
}

describe("PostgreSQL major-upgrade dump/restore -- adversarial, against the real rendered chart", function () {
    let dumpScript: string;
    let restoreScript: string;
    let sourceHost: string;
    let restoreHost: string;
    // The dump Job's TARGET_PGHOST -- the NEW major's instance. The dump script
    // queries it (NOT sourceHost) for the completed-migration marker, so it must
    // be supplied to the container or `set -o nounset` aborts the script.
    let dumpTargetHost: string;

    before(function (this) {
        this.timeout(120000);
        sourceHost = `mu-src-${runId}`;
        const rendered = renderChart(sourceHost);
        const docs = splitDocs(rendered);
        const dumpDoc = findSingleJobDoc(docs, "-major-upgrade-dump");
        const restoreDoc = findSingleJobDoc(docs, "-major-upgrade-restore");

        const extractedDump = extractScript(dumpDoc);
        const extractedRestore = extractScript(restoreDoc);
        if (extractedDump === null) {
            throw new Error(
                "extractScript(dumpDoc) returned null -- the dump Job's rendered `command:` block did not have exactly one `- |` marker; refusing to run an empty/wrong script"
            );
        }
        if (extractedRestore === null) {
            throw new Error(
                "extractScript(restoreDoc) returned null -- the restore Job's rendered `command:` block did not have exactly one `- |` marker; refusing to run an empty/wrong script"
            );
        }
        dumpScript = extractedDump;
        restoreScript = extractedRestore;

        restoreHost = extractEnvValue(restoreDoc, "PGHOST") ?? "";
        if (!restoreHost) {
            throw new Error(
                "could not extract PGHOST from the rendered restore Job -- cannot name the target container to match it"
            );
        }

        dumpTargetHost = extractEnvValue(dumpDoc, "TARGET_PGHOST") ?? "";
        if (!dumpTargetHost) {
            throw new Error(
                "could not extract TARGET_PGHOST from the rendered dump Job -- the dump Job must consult the TARGET for the completed-migration marker, otherwise a repeat upgrade tries to dump from a source Service that no longer exists"
            );
        }
        if (dumpTargetHost !== restoreHost) {
            throw new Error(
                `the dump Job's TARGET_PGHOST (${dumpTargetHost}) must be the same instance as the restore Job's PGHOST (${restoreHost})`
            );
        }
        if (dumpTargetHost === sourceHost) {
            throw new Error(
                "the dump Job's TARGET_PGHOST must not be majorUpgrade.sourceHost -- the marker check has to interrogate the NEW instance"
            );
        }
    });

    it("extraction sanity: the real scripts are non-empty and contain the logic this test exists to exercise (guards against a vacuous pass)", function () {
        // A regression in `extractScript`, or the chart dropping the `- |`
        // block scalar entirely, must fail loudly here rather than let the
        // rest of the suite silently execute an empty string.
        expect(dumpScript.length, "dump script length").to.be.greaterThan(200);
        expect(restoreScript.length, "restore script length").to.be.greaterThan(
            200
        );

        expect(dumpScript).to.include("pg_dumpall");
        expect(dumpScript).to.include("--clean");
        expect(dumpScript).to.include("gzip");

        // The specific defect this test exists to catch: the filter MUST
        // be the state-machine `awk` form, confined by `indb`, not an
        // unconditional whole-stream `grep`.
        expect(restoreScript).to.include("awk -v u=");
        expect(restoreScript).to.include("indb");
        expect(restoreScript).to.include("DROP ROLE IF EXISTS");
        expect(restoreScript).to.include("CREATE ROLE");
        expect(restoreScript).to.not.match(/grep\s+-vF\s+-x/);

        expect(restoreHost, "PGHOST extracted from restore Job").to.not.equal(
            ""
        );

        // The completion marker must be a durable object INSIDE the target
        // database, never a file on the staging volume: that PVC is a
        // `before-hook-creation` hook, so Helm destroys and recreates it empty
        // on every upgrade and a file sentinel on it can never survive to the
        // next run. Both scripts must consult the same marker.
        expect(dumpScript).to.include("magda_major_upgrade");
        expect(restoreScript).to.include("magda_major_upgrade");
        expect(restoreScript).to.not.include("/staging/restore.complete");
        expect(dumpScript).to.include("TARGET_PGHOST");
    });

    describe("live dump + restore against real postgres:13.7 -> postgres:17.5", function () {
        const network = `mu-net-${runId}`;
        const stagingVolume = `mu-staging-${runId}`;
        const sourcePort = 25432;
        const targetPort = 25433;
        let serviceRunner: ServiceRunner;

        before(function (this) {
            // Deliberately NOT calling serviceRunner.create()/destroy(): this
            // reuses ONLY the docker-host resolution + k8s socat port-forward
            // glue (dockerServiceForwardHost / createPortForward), the same
            // pattern walgBackupRestore.spec.ts's restoreLatestBackup() uses
            // for its own plain `docker run` postgres fixtures. It does not
            // spin up any of ServiceRunner's compose-based services.
            serviceRunner = new ServiceRunner();
        });

        beforeEach(function (this) {
            this.timeout(30000);
            docker(["network", "rm", "-f", network], true);
            docker(["volume", "rm", "-f", stagingVolume], true);
            docker(["rm", "-f", sourceHost, restoreHost], true);
            docker(["network", "create", network]);
            docker(["volume", "create", stagingVolume]);
        });

        afterEach(async function (this) {
            this.timeout(60000);
            try {
                await serviceRunner.destroyPortForward(sourcePort);
            } catch {
                // no-op if no forward exists (e.g. not on k8s)
            }
            try {
                await serviceRunner.destroyPortForward(targetPort);
            } catch {
                // no-op
            }
            docker(["rm", "-f", sourceHost, restoreHost], true);
            docker(["volume", "rm", "-f", stagingVolume], true);
            docker(["network", "rm", "-f", network], true);
        });

        it("preserves every database, table, role, sequence and adversarial row across the real dump + restore, and the role-filter cannot touch COPY data", async function (this) {
            this.timeout(ENV_SETUP_TIME_OUT);

            // 1. Start the source (PG13) and target (PG17) servers on a
            // private network, named to match what the render expects
            // (sourceHost was passed into helm --set; restoreHost was
            // extracted from the render's own PGHOST).
            //
            // POSTGRES_HOST_AUTH_METHOD=md5 on BOTH: PG13 defaults to
            // md5-hashed passwords, PG17 defaults to requiring
            // scram-sha-256, and `pg_dumpall --clean` faithfully dumps (and
            // the restore replays) the source's literal md5 password hash
            // for the connecting role -- an md5 hash cannot satisfy a
            // scram-sha-256 challenge, which would otherwise break the
            // `\connect` reauthentication the restore performs for every
            // database for a reason that has nothing to do with the filter
            // under test. This mirrors how a real cluster is configured
            // consistently across the major-version boundary.
            docker([
                "run",
                "-d",
                "--name",
                sourceHost,
                "--network",
                network,
                "-p",
                `${sourcePort}:5432`,
                "-e",
                `POSTGRES_PASSWORD=${PGPASSWORD}`,
                "-e",
                "POSTGRES_HOST_AUTH_METHOD=md5",
                SOURCE_IMAGE
            ]);
            docker([
                "run",
                "-d",
                "--name",
                restoreHost,
                "--network",
                network,
                "-p",
                `${targetPort}:5432`,
                "-e",
                `POSTGRES_PASSWORD=${PGPASSWORD}`,
                "-e",
                "POSTGRES_HOST_AUTH_METHOD=md5",
                TARGET_IMAGE
            ]);
            await serviceRunner.createPortForward(sourcePort);
            await serviceRunner.createPortForward(targetPort);
            const host = serviceRunner.dockerServiceForwardHost || "localhost";

            await waitForPg(pgConfig(host, sourcePort, "postgres"));
            await waitForPg(pgConfig(host, targetPort, "postgres"));

            // 2. Seed the adversarial fixture on the SOURCE.
            await withClient(host, sourcePort, "postgres", async (c) => {
                await c.query("CREATE ROLE role_group_g NOLOGIN");
                await c.query(
                    `CREATE ROLE role_owner_x LOGIN PASSWORD '${OWNER_ROLE_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE`
                );
                await c.query("GRANT role_group_g TO role_owner_x");
                await c.query("CREATE DATABASE db_alpha");
                await c.query("CREATE DATABASE db_beta");
                await c.query("CREATE DATABASE db_gamma");
            });

            await withClient(host, sourcePort, "db_alpha", async (c) => {
                // The exact case that broke before: a single-column table
                // whose rows are literally the two lines the filter must
                // strip from the GLOBALS header, plus a benign control row.
                await c.query("CREATE TABLE adversarial_role_lines (v text)");
                await c.query(
                    `INSERT INTO adversarial_role_lines (v) VALUES
                        ('DROP ROLE IF EXISTS postgres;'),
                        ('CREATE ROLE postgres;'),
                        ('benign control row')`
                );

                await c.query(
                    "CREATE TABLE owned_by_x (id int primary key, note text)"
                );
                await c.query("INSERT INTO owned_by_x VALUES (1, 'owned row')");
                await c.query("ALTER TABLE owned_by_x OWNER TO role_owner_x");

                await c.query(
                    "CREATE TABLE texty (id int primary key, v text)"
                );
                await c.query("INSERT INTO texty (id, v) VALUES ($1, $2)", [
                    1,
                    WEIRD_TEXT
                ]);
            });

            await withClient(host, sourcePort, "db_beta", async (c) => {
                // Probes the awk `indb` state machine: a DATA row that
                // itself begins with "\connect ". It must survive
                // byte-identical and must not desynchronise the filter.
                await c.query("CREATE TABLE connect_probe (v text)");
                await c.query(
                    "INSERT INTO connect_probe (v) VALUES ($1), ($2)",
                    ["\\connect db_gamma", "benign probe control"]
                );
            });

            await withClient(host, sourcePort, "db_gamma", async (c) => {
                await c.query("CREATE SEQUENCE seq_custom");
                await c.query("SELECT setval('seq_custom', 424242, true)");

                await c.query(
                    "CREATE TABLE serial_tbl (id serial primary key, note text)"
                );
                await c.query(
                    "INSERT INTO serial_tbl (note) VALUES ('a'), ('b'), ('c')"
                );

                // A reasonably wide multi-column table: the filter cannot
                // match a multi-column COPY line by construction, but this
                // proves ordinary wide rows still round-trip untouched.
                await c.query(`CREATE TABLE wide_tbl (
                    id int primary key,
                    c_text text,
                    c_int int,
                    c_bool boolean,
                    c_numeric numeric(10,2),
                    c_ts timestamp,
                    c_arr int[],
                    c_json jsonb,
                    c_text2 text,
                    c_int2 int,
                    c_bool2 boolean,
                    c_numeric2 numeric(8,3)
                )`);
                await c.query(
                    `INSERT INTO wide_tbl (id, c_text, c_int, c_bool, c_numeric, c_ts, c_arr, c_json, c_text2, c_int2, c_bool2, c_numeric2)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
                    [
                        1,
                        "row one",
                        111,
                        true,
                        "12.34",
                        new Date("2024-01-01T00:00:00Z"),
                        [1, 2, 3],
                        JSON.stringify({ a: 1 }),
                        "second text",
                        222,
                        false,
                        "56.789"
                    ]
                );
                await c.query(
                    `INSERT INTO wide_tbl (id, c_text, c_int, c_bool, c_numeric, c_ts, c_arr, c_json, c_text2, c_int2, c_bool2, c_numeric2)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
                    [
                        2,
                        "row two",
                        -5,
                        false,
                        "0.00",
                        new Date("2024-06-15T12:30:00Z"),
                        [4, 5],
                        JSON.stringify({ b: [1, 2, 3] }),
                        "",
                        0,
                        true,
                        "-1.500"
                    ]
                );
            });

            // 3. Run the REAL, extracted dump script against the source.
            const dumpEnv = {
                PGHOST: sourceHost,
                TARGET_PGHOST: dumpTargetHost,
                PGUSER: "postgres",
                PGPASSWORD,
                PGSSLMODE: "disable",
                PGCONNECT_TIMEOUT: "10"
            };
            const dumpResult = runRealScript({
                image: RUNNER_IMAGE,
                network,
                env: dumpEnv,
                stagingVolume,
                script: dumpScript
            });
            expect(
                dumpResult.status,
                `dump script (real, extracted from the rendered chart) failed:\nSTDOUT:\n${dumpResult.stdout}\nSTDERR:\n${dumpResult.stderr}`
            ).to.equal(0);
            expect(dumpResult.stdout).to.include("Dump complete");

            // 4. Run the REAL, extracted restore script against the target.
            const restoreEnv = {
                PGHOST: restoreHost,
                PGUSER: "postgres",
                PGPASSWORD,
                PGSSLMODE: "disable",
                PGCONNECT_TIMEOUT: "10"
            };
            const restoreResult = runRealScript({
                image: RUNNER_IMAGE,
                network,
                env: restoreEnv,
                stagingVolume,
                script: restoreScript
            });
            expect(
                restoreResult.status,
                `restore script (real, extracted from the rendered chart) failed:\nSTDOUT:\n${restoreResult.stdout}\nSTDERR:\n${restoreResult.stderr}`
            ).to.equal(0);
            expect(restoreResult.stdout).to.match(
                /Restore complete: 3 of 3 database\(s\) now present\./
            );

            // 5. Assert full data integrity on the RESTORED target -- exit
            // codes and the Job's own "3 of 3" line are necessary but not
            // sufficient; a restore that exits 0 having silently dropped a
            // row must fail THIS test.
            await withClient(host, targetPort, "postgres", async (c) => {
                const dbs = await c.query(
                    "SELECT datname FROM pg_database WHERE datname NOT IN ('postgres','template0','template1') ORDER BY datname"
                );
                expect(
                    dbs.rows.map((r) => r.datname),
                    "restored database set"
                ).to.deep.equal(["db_alpha", "db_beta", "db_gamma"]);

                const role = await c.query(
                    "SELECT rolsuper, rolcreatedb, rolcreaterole, rolcanlogin FROM pg_roles WHERE rolname = 'role_owner_x'"
                );
                expect(
                    role.rows.length,
                    "role_owner_x must exist on the target"
                ).to.equal(1);
                expect(role.rows[0].rolsuper, "role_owner_x.rolsuper").to.equal(
                    false
                );
                expect(
                    role.rows[0].rolcanlogin,
                    "role_owner_x.rolcanlogin"
                ).to.equal(true);

                const groupRole = await c.query(
                    "SELECT rolname FROM pg_roles WHERE rolname = 'role_group_g'"
                );
                expect(
                    groupRole.rows.length,
                    "role_group_g must exist on the target"
                ).to.equal(1);

                const membership = await c.query(`
                    SELECT 1
                    FROM pg_auth_members am
                    JOIN pg_roles m ON m.oid = am.member
                    JOIN pg_roles g ON g.oid = am.roleid
                    WHERE m.rolname = 'role_owner_x' AND g.rolname = 'role_group_g'
                `);
                expect(
                    membership.rows.length,
                    "role_owner_x must be a member of role_group_g"
                ).to.equal(1);

                // The privileged connecting role's own DROP/CREATE pair must
                // have been suppressed (that is the whole point of the
                // filter) while its ALTER ROLE attributes still applied --
                // proven simply by the fact this query, connected AS
                // "postgres", is running against a server that still has a
                // working "postgres" role at all.
                const postgresRole = await c.query(
                    "SELECT rolsuper FROM pg_roles WHERE rolname = 'postgres'"
                );
                expect(postgresRole.rows.length).to.equal(1);
                expect(postgresRole.rows[0].rolsuper).to.equal(true);
            });

            await withClient(host, targetPort, "db_alpha", async (c) => {
                const countRes = await c.query(
                    "SELECT count(*)::int AS c FROM adversarial_role_lines"
                );
                expect(
                    countRes.rows[0].c,
                    "adversarial_role_lines row count -- THIS is what the old unconditional grep -vF -x filter silently shrank from 3 to 1"
                ).to.equal(3);

                const rl = await c.query(
                    "SELECT v FROM adversarial_role_lines"
                );
                // Sort in JS on both sides -- Postgres' default locale
                // collation (case-insensitive-ish) and JS's default
                // ASCII/UTF-16 `.sort()` do not agree on ordering, which is
                // irrelevant to what this assertion actually checks (that
                // all three exact rows, and only those three, survived).
                expect(
                    rl.rows.map((r) => r.v).sort(),
                    "adversarial_role_lines exact content"
                ).to.deep.equal(
                    [
                        "CREATE ROLE postgres;",
                        "DROP ROLE IF EXISTS postgres;",
                        "benign control row"
                    ].sort()
                );

                const owner = await c.query(
                    "SELECT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE relname = 'owned_by_x'"
                );
                expect(owner.rows[0].owner, "owned_by_x table owner").to.equal(
                    "role_owner_x"
                );
                const ownedCount = await c.query(
                    "SELECT count(*)::int AS c FROM owned_by_x"
                );
                expect(ownedCount.rows[0].c).to.equal(1);
                const ownedRows = await c.query(
                    "SELECT id, note FROM owned_by_x"
                );
                expect(ownedRows.rows).to.deep.equal([
                    { id: 1, note: "owned row" }
                ]);

                const textyCount = await c.query(
                    "SELECT count(*)::int AS c FROM texty"
                );
                expect(textyCount.rows[0].c).to.equal(1);
                const texty = await c.query("SELECT v FROM texty WHERE id = 1");
                expect(
                    texty.rows[0].v,
                    "unicode/quote/tab/backslash text round-trip"
                ).to.equal(WEIRD_TEXT);
            });

            await withClient(host, targetPort, "db_beta", async (c) => {
                const countRes = await c.query(
                    "SELECT count(*)::int AS c FROM connect_probe"
                );
                expect(countRes.rows[0].c, "connect_probe row count").to.equal(
                    2
                );

                const probe = await c.query("SELECT v FROM connect_probe");
                expect(
                    probe.rows.map((r) => r.v).sort(),
                    "the literal \\connect-prefixed data row must survive byte-identical"
                ).to.deep.equal(
                    ["\\connect db_gamma", "benign probe control"].sort()
                );
            });

            await withClient(host, targetPort, "db_gamma", async (c) => {
                const seq = await c.query("SELECT last_value FROM seq_custom");
                expect(
                    Number(seq.rows[0].last_value),
                    "seq_custom.last_value"
                ).to.equal(424242);

                const serialCount = await c.query(
                    "SELECT count(*)::int AS c FROM serial_tbl"
                );
                expect(serialCount.rows[0].c, "serial_tbl row count").to.equal(
                    3
                );
                const serialSeq = await c.query(
                    "SELECT last_value FROM serial_tbl_id_seq"
                );
                expect(
                    Number(serialSeq.rows[0].last_value),
                    "serial_tbl_id_seq.last_value"
                ).to.be.at.least(3);

                const wideCount = await c.query(
                    "SELECT count(*)::int AS c FROM wide_tbl"
                );
                expect(wideCount.rows[0].c, "wide_tbl row count").to.equal(2);
                const wide = await c.query(
                    "SELECT * FROM wide_tbl ORDER BY id"
                );
                expect(wide.rows[0].c_text).to.equal("row one");
                expect(wide.rows[0].c_int).to.equal(111);
                expect(wide.rows[0].c_bool).to.equal(true);
                expect(wide.rows[0].c_arr).to.deep.equal([1, 2, 3]);
                expect(wide.rows[0].c_json).to.deep.equal({ a: 1 });
                expect(wide.rows[1].c_text).to.equal("row two");
                expect(wide.rows[1].c_int).to.equal(-5);
                expect(wide.rows[1].c_bool).to.equal(false);
                expect(wide.rows[1].c_arr).to.deep.equal([4, 5]);
                expect(wide.rows[1].c_json).to.deep.equal({ b: [1, 2, 3] });
            });

            // 6. The durable completion marker. It has to live INSIDE the
            // target: the staging PVC is a `before-hook-creation` hook that
            // Helm destroys and recreates empty on every upgrade, so the file
            // sentinel this replaced could never have survived to the next run.
            let markerCompletedAt: string;
            await withClient(host, targetPort, "postgres", async (c) => {
                const marker = await c.query(
                    "SELECT completed_at, databases_restored, server_version FROM public.magda_major_upgrade"
                );
                expect(
                    marker.rows.length,
                    "public.magda_major_upgrade must hold exactly one row after one verified restore"
                ).to.equal(1);
                expect(
                    marker.rows[0].databases_restored,
                    "marker.databases_restored"
                ).to.equal(3);
                expect(marker.rows[0].server_version).to.include("PostgreSQL");
                markerCompletedAt = marker.rows[0].completed_at.toISOString();
            });

            // 7. THE REPEAT-UPGRADE NO-OP. Model what a second `helm upgrade`
            // with `majorUpgrade.enabled` still true actually looks like:
            //   * the previous major's Service is GONE (the first upgrade's main
            //     pass deleted it), so anything that tries to dump must fail;
            //   * the staging PVC has been delete-recreated EMPTY by the
            //     `before-hook-creation` PVC hook, so no dump and no file
            //     sentinel survive.
            // Both Jobs must nevertheless exit 0 and change nothing. Before the
            // marker moved into the target database, the second upgrade could
            // not even reach these scripts -- it died in Helm's pre-upgrade hook
            // phase with "context deadline exceeded".
            docker(["rm", "-f", sourceHost], true);
            docker([
                "run",
                "--rm",
                "-v",
                `${stagingVolume}:/staging`,
                RUNNER_IMAGE,
                "bash",
                "-c",
                "rm -rf /staging/..?* /staging/.[!.]* /staging/*; ls -A /staging"
            ]);

            const repeatDump = runRealScript({
                image: RUNNER_IMAGE,
                network,
                env: dumpEnv,
                stagingVolume,
                script: dumpScript
            });
            expect(
                repeatDump.status,
                `repeat dump must be a no-op, not a failure:\nSTDOUT:\n${repeatDump.stdout}\nSTDERR:\n${repeatDump.stderr}`
            ).to.equal(0);
            expect(repeatDump.stdout).to.include("Nothing to dump");
            // It must have reached that conclusion WITHOUT touching the source,
            // which no longer exists -- if it had tried, it would have waited on
            // `sourceHost` and failed.
            expect(
                repeatDump.stdout,
                "the repeat dump must not attempt to contact the removed source Service"
            ).to.not.include("Waiting for the source server");

            const repeatRestore = runRealScript({
                image: RUNNER_IMAGE,
                network,
                env: restoreEnv,
                stagingVolume,
                script: restoreScript
            });
            expect(
                repeatRestore.status,
                `repeat restore must be a no-op, not a failure:\nSTDOUT:\n${repeatRestore.stdout}\nSTDERR:\n${repeatRestore.stderr}`
            ).to.equal(0);
            expect(repeatRestore.stdout).to.match(
                /The target already holds 3 database\(s\); the migration has already run\./
            );

            // Nothing was re-restored: the marker is still the original row.
            await withClient(host, targetPort, "postgres", async (c) => {
                const marker = await c.query(
                    "SELECT completed_at FROM public.magda_major_upgrade"
                );
                expect(
                    marker.rows.length,
                    "the repeat run must not append another marker row"
                ).to.equal(1);
                expect(
                    marker.rows[0].completed_at.toISOString(),
                    "the repeat run must not rewrite the marker"
                ).to.equal(markerCompletedAt);
                const rows = await c.query(
                    "SELECT count(*)::int AS c FROM pg_database WHERE datname NOT IN ('postgres','template0','template1')"
                );
                expect(rows.rows[0].c).to.equal(3);
            });

            // 8. The partial-restore case must still HARD ERROR: databases
            // present but no marker means a previous restore died mid-stream,
            // and blessing that as "already migrated" would let the DB migrators
            // build schema over incomplete data with the upgrade reporting green.
            await withClient(host, targetPort, "postgres", async (c) => {
                await c.query("DROP TABLE public.magda_major_upgrade");
            });
            const partialRestore = runRealScript({
                image: RUNNER_IMAGE,
                network,
                env: restoreEnv,
                stagingVolume,
                script: restoreScript
            });
            expect(
                partialRestore.status,
                "databases present with no completion marker must be a hard error, never a silent success"
            ).to.not.equal(0);
            expect(partialRestore.stderr).to.include(
                "Manual recovery required"
            );
        });

        it("a restore that fails its own RESTORED-vs-EXPECTED verification writes no completion marker, so a retry cannot mistake the partial restore for a completed migration", async function (this) {
            this.timeout(ENV_SETUP_TIME_OUT);

            docker([
                "run",
                "-d",
                "--name",
                sourceHost,
                "--network",
                network,
                "-p",
                `${sourcePort}:5432`,
                "-e",
                `POSTGRES_PASSWORD=${PGPASSWORD}`,
                "-e",
                "POSTGRES_HOST_AUTH_METHOD=md5",
                SOURCE_IMAGE
            ]);
            docker([
                "run",
                "-d",
                "--name",
                restoreHost,
                "--network",
                network,
                "-p",
                `${targetPort}:5432`,
                "-e",
                `POSTGRES_PASSWORD=${PGPASSWORD}`,
                "-e",
                "POSTGRES_HOST_AUTH_METHOD=md5",
                TARGET_IMAGE
            ]);
            await serviceRunner.createPortForward(sourcePort);
            await serviceRunner.createPortForward(targetPort);
            const host = serviceRunner.dockerServiceForwardHost || "localhost";
            await waitForPg(pgConfig(host, sourcePort, "postgres"));
            await waitForPg(pgConfig(host, targetPort, "postgres"));

            // One real database, plus a data row engineered to be an
            // adversarial input for the restore script's own EXPECTED
            // calculation: `zgrep -a '^CREATE DATABASE '` is a naive text
            // scan over the whole dump, not SQL-aware, so a COPY data row
            // that happens to read "CREATE DATABASE ...;" is counted as if
            // it were a real database name. This inflates EXPECTED one
            // above the number of databases the restore actually creates --
            // the same "restore completed structurally (psql exits 0) but
            // is semantically incomplete" signature the RESTORED-vs-EXPECTED
            // check exists to catch -- without needing to kill any process
            // or corrupt the gzip stream.
            await withClient(host, sourcePort, "postgres", async (c) => {
                await c.query("CREATE DATABASE db_one");
            });
            await withClient(host, sourcePort, "db_one", async (c) => {
                await c.query("CREATE TABLE inflate_expected (v text)");
                await c.query("INSERT INTO inflate_expected (v) VALUES ($1)", [
                    "CREATE DATABASE ghost_inflate_expected;"
                ]);
            });

            const dumpEnv = {
                PGHOST: sourceHost,
                TARGET_PGHOST: dumpTargetHost,
                PGUSER: "postgres",
                PGPASSWORD,
                PGSSLMODE: "disable",
                PGCONNECT_TIMEOUT: "10"
            };
            const dumpResult = runRealScript({
                image: RUNNER_IMAGE,
                network,
                env: dumpEnv,
                stagingVolume,
                script: dumpScript
            });
            expect(
                dumpResult.status,
                `dump script failed:\nSTDOUT:\n${dumpResult.stdout}\nSTDERR:\n${dumpResult.stderr}`
            ).to.equal(0);

            const restoreEnv = {
                PGHOST: restoreHost,
                PGUSER: "postgres",
                PGPASSWORD,
                PGSSLMODE: "disable",
                PGCONNECT_TIMEOUT: "10"
            };
            const restoreResult = runRealScript({
                image: RUNNER_IMAGE,
                network,
                env: restoreEnv,
                stagingVolume,
                script: restoreScript
            });
            expect(
                restoreResult.status,
                "a RESTORED/EXPECTED mismatch must be a hard failure, never exit 0"
            ).to.not.equal(0);
            expect(restoreResult.stderr).to.include(
                "A partial restore must not be reported as a success"
            );

            await withClient(host, targetPort, "postgres", async (c) => {
                const marker = await c.query(
                    "SELECT to_regclass('public.magda_major_upgrade') AS reg"
                );
                expect(
                    marker.rows[0].reg,
                    "a failed RESTORED-vs-EXPECTED verification must leave no completion marker table -- otherwise a retry would read the partial restore as already migrated"
                ).to.equal(null);
            });
        });

        it("marker contamination: after a successful restore the target's completion marker is THIS run's own row, not one inherited from the dump of the source's postgres database", async function (this) {
            this.timeout(ENV_SETUP_TIME_OUT);

            docker([
                "run",
                "-d",
                "--name",
                sourceHost,
                "--network",
                network,
                "-p",
                `${sourcePort}:5432`,
                "-e",
                `POSTGRES_PASSWORD=${PGPASSWORD}`,
                "-e",
                "POSTGRES_HOST_AUTH_METHOD=md5",
                SOURCE_IMAGE
            ]);
            docker([
                "run",
                "-d",
                "--name",
                restoreHost,
                "--network",
                network,
                "-p",
                `${targetPort}:5432`,
                "-e",
                `POSTGRES_PASSWORD=${PGPASSWORD}`,
                "-e",
                "POSTGRES_HOST_AUTH_METHOD=md5",
                TARGET_IMAGE
            ]);
            await serviceRunner.createPortForward(sourcePort);
            await serviceRunner.createPortForward(targetPort);
            const host = serviceRunner.dockerServiceForwardHost || "localhost";
            await waitForPg(pgConfig(host, sourcePort, "postgres"));
            await waitForPg(pgConfig(host, targetPort, "postgres"));

            const INHERITED_SERVER_VERSION =
                "INHERITED-FAKE-PREVIOUS-GENERATION";

            // Simulate a marker LEFT ON THE SOURCE from a previous
            // migration generation (e.g. this source was itself once a
            // majorUpgrade target). `pg_dumpall --clean --if-exists` dumps
            // the "postgres" database -- and so this very table and its row
            // -- as part of its normal output; nothing here modifies the
            // dump or the restore script, only what the SOURCE server
            // contains before the REAL dump/restore scripts run.
            await withClient(host, sourcePort, "postgres", async (c) => {
                await c.query(`CREATE TABLE public.magda_major_upgrade (
                    completed_at timestamptz NOT NULL DEFAULT now(),
                    databases_restored integer NOT NULL,
                    server_version text NOT NULL
                )`);
                await c.query(
                    "INSERT INTO public.magda_major_upgrade (databases_restored, server_version) VALUES ($1, $2)",
                    [999, INHERITED_SERVER_VERSION]
                );
                await c.query("CREATE DATABASE db_one");
            });

            const dumpEnv = {
                PGHOST: sourceHost,
                TARGET_PGHOST: dumpTargetHost,
                PGUSER: "postgres",
                PGPASSWORD,
                PGSSLMODE: "disable",
                PGCONNECT_TIMEOUT: "10"
            };
            const dumpResult = runRealScript({
                image: RUNNER_IMAGE,
                network,
                env: dumpEnv,
                stagingVolume,
                script: dumpScript
            });
            expect(
                dumpResult.status,
                `dump script failed:\nSTDOUT:\n${dumpResult.stdout}\nSTDERR:\n${dumpResult.stderr}`
            ).to.equal(0);

            const restoreEnv = {
                PGHOST: restoreHost,
                PGUSER: "postgres",
                PGPASSWORD,
                PGSSLMODE: "disable",
                PGCONNECT_TIMEOUT: "10"
            };
            const restoreResult = runRealScript({
                image: RUNNER_IMAGE,
                network,
                env: restoreEnv,
                stagingVolume,
                script: restoreScript
            });
            expect(
                restoreResult.status,
                `restore script failed:\nSTDOUT:\n${restoreResult.stdout}\nSTDERR:\n${restoreResult.stderr}`
            ).to.equal(0);
            expect(restoreResult.stdout).to.match(
                /Restore complete: 1 of 1 database\(s\) now present\./
            );

            await withClient(host, targetPort, "postgres", async (c) => {
                const marker = await c.query(
                    "SELECT databases_restored, server_version FROM public.magda_major_upgrade"
                );
                expect(
                    marker.rows.length,
                    "exactly one marker row after a successful restore -- the row inherited from the dump must not survive alongside this run's own"
                ).to.equal(1);
                expect(
                    marker.rows[0].databases_restored,
                    "must reflect THIS run's own restore count, not the inherited row's stale value"
                ).to.equal(1);
                expect(
                    marker.rows[0].server_version,
                    "must not be the row inherited from the source's dump"
                ).to.not.include(INHERITED_SERVER_VERSION);
                expect(marker.rows[0].server_version).to.include("PostgreSQL");
            });
        });

        it("marker contamination + failed verification: an inherited marker from the dump does not make a semantically-incomplete restore look already migrated, and a retry still takes the hard-error path", async function (this) {
            this.timeout(ENV_SETUP_TIME_OUT);

            docker([
                "run",
                "-d",
                "--name",
                sourceHost,
                "--network",
                network,
                "-p",
                `${sourcePort}:5432`,
                "-e",
                `POSTGRES_PASSWORD=${PGPASSWORD}`,
                "-e",
                "POSTGRES_HOST_AUTH_METHOD=md5",
                SOURCE_IMAGE
            ]);
            docker([
                "run",
                "-d",
                "--name",
                restoreHost,
                "--network",
                network,
                "-p",
                `${targetPort}:5432`,
                "-e",
                `POSTGRES_PASSWORD=${PGPASSWORD}`,
                "-e",
                "POSTGRES_HOST_AUTH_METHOD=md5",
                TARGET_IMAGE
            ]);
            await serviceRunner.createPortForward(sourcePort);
            await serviceRunner.createPortForward(targetPort);
            const host = serviceRunner.dockerServiceForwardHost || "localhost";
            await waitForPg(pgConfig(host, sourcePort, "postgres"));
            await waitForPg(pgConfig(host, targetPort, "postgres"));

            const INHERITED_SERVER_VERSION =
                "INHERITED-FAKE-PREVIOUS-GENERATION";

            // Both adversarial ingredients from the two tests above,
            // combined: an inherited marker row on the SOURCE (so the dump
            // carries a "postgres" database section that would resurrect
            // the old marker on the target), AND a data row engineered to
            // inflate EXPECTED so the restore's own verification hard-fails
            // even though the psql pipe itself completes.
            await withClient(host, sourcePort, "postgres", async (c) => {
                await c.query(`CREATE TABLE public.magda_major_upgrade (
                    completed_at timestamptz NOT NULL DEFAULT now(),
                    databases_restored integer NOT NULL,
                    server_version text NOT NULL
                )`);
                await c.query(
                    "INSERT INTO public.magda_major_upgrade (databases_restored, server_version) VALUES ($1, $2)",
                    [999, INHERITED_SERVER_VERSION]
                );
                await c.query("CREATE DATABASE db_one");
            });
            await withClient(host, sourcePort, "db_one", async (c) => {
                await c.query("CREATE TABLE inflate_expected (v text)");
                await c.query("INSERT INTO inflate_expected (v) VALUES ($1)", [
                    "CREATE DATABASE ghost_inflate_expected;"
                ]);
            });

            const dumpEnv = {
                PGHOST: sourceHost,
                TARGET_PGHOST: dumpTargetHost,
                PGUSER: "postgres",
                PGPASSWORD,
                PGSSLMODE: "disable",
                PGCONNECT_TIMEOUT: "10"
            };
            const dumpResult = runRealScript({
                image: RUNNER_IMAGE,
                network,
                env: dumpEnv,
                stagingVolume,
                script: dumpScript
            });
            expect(
                dumpResult.status,
                `dump script failed:\nSTDOUT:\n${dumpResult.stdout}\nSTDERR:\n${dumpResult.stderr}`
            ).to.equal(0);

            const restoreEnv = {
                PGHOST: restoreHost,
                PGUSER: "postgres",
                PGPASSWORD,
                PGSSLMODE: "disable",
                PGCONNECT_TIMEOUT: "10"
            };
            const restoreResult = runRealScript({
                image: RUNNER_IMAGE,
                network,
                env: restoreEnv,
                stagingVolume,
                script: restoreScript
            });
            expect(
                restoreResult.status,
                "a mismatched restore must hard-fail even though the dump carried an inherited marker"
            ).to.not.equal(0);
            expect(
                restoreResult.stdout + restoreResult.stderr,
                "must take the hard-error path, never report success on an inherited marker"
            ).to.not.match(/already run/);
            expect(restoreResult.stderr).to.include(
                "A partial restore must not be reported as a success"
            );

            // The DROP (fix 1a) ran after the pipeline but before this
            // failing check, so the row that WOULD have been restored into
            // the target's "postgres" database by the dump's own inherited
            // "postgres" section does not survive as a marker.
            await withClient(host, targetPort, "postgres", async (c) => {
                const marker = await c.query(
                    "SELECT to_regclass('public.magda_major_upgrade') AS reg"
                );
                expect(
                    marker.rows[0].reg,
                    "a failed restore must not leave the inherited marker behind for a retry to misread as already-migrated"
                ).to.equal(null);
            });

            // Prove the retry explicitly: re-running the restore script
            // against the same (partially-loaded) target must take the
            // "databases present, marker absent" hard-error branch, NOT
            // "already migrated" -- this is the exact bug fix 1 closes.
            const retryResult = runRealScript({
                image: RUNNER_IMAGE,
                network,
                env: restoreEnv,
                stagingVolume,
                script: restoreScript
            });
            expect(
                retryResult.status,
                "a retry against a partially-loaded target must still hard-error, never silently declare victory"
            ).to.not.equal(0);
            expect(retryResult.stderr).to.include("Manual recovery required");
            expect(
                retryResult.stdout + retryResult.stderr,
                "the retry must not take the already-migrated path"
            ).to.not.match(/already run/);
        });
    });
});
