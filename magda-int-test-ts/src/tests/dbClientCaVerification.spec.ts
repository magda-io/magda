import {} from "mocha";
import { expect } from "chai";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { v4 as uuidV4 } from "uuid";
import { getPgSslConfigFromEnv } from "magda-typescript-common/src/createPgPool.js";

/**
 * End-to-end proof that `getPgSslConfigFromEnv` (magda-typescript-common/src/createPgPool.ts)
 * actually causes node-postgres to verify a server's certificate chain against a
 * CA, against a REAL TLS-enforcing PostgreSQL server -- not merely that the
 * function returns the right-looking object in isolation (that is already
 * covered by magda-typescript-common/src/test/createPgPool.spec.ts).
 *
 * WHY THIS TEST EXISTS: Tasks 2-8 wired PGSSLMODE/PGSSLROOTCERT through the
 * chart and into `getPgSslConfigFromEnv`, and unit tests assert the mapping
 * in isolation. None of that proves TLS verification actually *happens* at
 * runtime -- a config object that merely *looks* like `{ rejectUnauthorized:
 * true, ca: "..." }` would pass every unit test even if some future change
 * silently stopped node-postgres from using it (e.g. a typo that passes `ssl:
 * true` instead of `ssl: sslConfig`). The only way to catch that class of
 * defect is to drive a REAL client, configured by the REAL function, against
 * a REAL server whose certificate chains to a REAL CA, and separately prove
 * that swapping in an unrelated CA makes verification REJECT the connection
 * for a certificate reason (not a typo/connectivity reason).
 *
 * This spec never re-implements `getPgSslConfigFromEnv` or the chart's CA
 * delivery -- it imports the former directly and renders the latter with
 * `helm template`.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// magda-int-test-ts/src/tests -> repo root
const REPO_ROOT = path.resolve(__dirname, "../../../");
const CHART_DIR = path.resolve(REPO_ROOT, "deploy/helm/magda-core");

const ENV_SETUP_TIME_OUT = 120000; // generous: cert generation + container pull/start

const runId = uuidV4().slice(0, 8);
const NET = `ca-verify-net-${runId}`;
const PG = `ca-verify-pg-${runId}`;
const PGPASSWORD = "CaVerify#1";
const SERVER_IMAGE = "postgres:17";

// --- small local helpers, mirroring postgresMajorUpgrade.spec.ts's idioms -----

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

/** Run `openssl`, throwing loudly (never silently) on failure. */
function opensslOrThrow(args: string[]): void {
    const res = spawnSync("openssl", args, { encoding: "utf8" });
    if (res.status !== 0) {
        throw new Error(
            `openssl ${args.join(" ")} failed (exit ${res.status}):\n${
                res.stderr
            }`
        );
    }
}

/** Generate a fresh self-signed CA (key + cert) in `dir`. */
function makeCa(dir: string, cn: string): void {
    opensslOrThrow(["genrsa", "-out", `${dir}/ca.key`, "2048"]);
    opensslOrThrow([
        "req",
        "-x509",
        "-new",
        "-nodes",
        "-key",
        `${dir}/ca.key`,
        "-days",
        "3650",
        "-subj",
        `/CN=${cn}`,
        "-out",
        `${dir}/ca.crt`
    ]);
}

/**
 * Generate a server key + certificate in `dir`, signed by the CA already in
 * `dir` (from `makeCa`). The SAN must cover every name used to reach the
 * server: `localhost`/`127.0.0.1` for the host-side node-postgres leg (via
 * the mapped port) and the container name (`PG`) for the in-container `psql`
 * leg -- a SAN mismatch fails `verify-full` for the wrong reason entirely.
 */
function makeServerCert(dir: string): void {
    opensslOrThrow(["genrsa", "-out", `${dir}/server.key`, "2048"]);
    opensslOrThrow([
        "req",
        "-new",
        "-key",
        `${dir}/server.key`,
        "-subj",
        `/CN=${PG}`,
        "-out",
        `${dir}/server.csr`
    ]);
    fs.writeFileSync(
        `${dir}/ext.cnf`,
        `subjectAltName=DNS:localhost,IP:127.0.0.1,DNS:${PG}\n`
    );
    opensslOrThrow([
        "x509",
        "-req",
        "-in",
        `${dir}/server.csr`,
        "-CA",
        `${dir}/ca.crt`,
        "-CAkey",
        `${dir}/ca.key`,
        "-CAcreateserial",
        "-days",
        "3650",
        "-extfile",
        `${dir}/ext.cnf`,
        "-out",
        `${dir}/server.crt`
    ]);
    // The server key file must be mode 0600 or PostgreSQL refuses to start.
    // This only fixes the PERMISSION bits on the host copy; ownership still
    // has to be fixed again inside the container (see the entrypoint script
    // below) because a host uid is meaningless to the container's "postgres"
    // OS user.
    fs.chmodSync(`${dir}/server.key`, 0o600);
}

/** Parse the host port docker assigned for `containerPort` on `container`. */
function getHostPort(container: string, containerPort: number): number {
    const out = docker(["port", container, String(containerPort)]);
    const firstLine = out.split("\n")[0];
    const m = firstLine.match(/:(\d+)\s*$/);
    if (!m) {
        throw new Error(
            `could not parse a host port for ${container}:${containerPort} from "docker port" output: "${out}"`
        );
    }
    return parseInt(m[1], 10);
}

/**
 * Fail loudly, with the container's own logs, if `container` is not running.
 * A server that crashes during startup (a bad cert, an OOM kill, a future
 * cert-delivery regression) otherwise only surfaces later as getHostPort's
 * opaque "no public port '5432' published" -- which is exactly how the
 * Docker-in-Docker bind-mount bug (see the create/cp/start note in `before`)
 * hid as a mysterious CI "flake". Checking here turns that into a one-line
 * diagnosis.
 */
function assertContainerRunning(container: string): void {
    const status = docker(
        ["inspect", "-f", "{{.State.Status}}", container],
        true
    );
    if (status !== "running") {
        const logs = docker(["logs", container], true);
        throw new Error(
            `server container ${container} is not running (status: "${status}"); its logs were:\n${logs}`
        );
    }
}

/**
 * Poll until the server accepts a TLS connection. This deliberately does NOT
 * validate the certificate (`rejectUnauthorized: false`, i.e. libpq's
 * `require`) -- it exists only to detect "the server is up", not to exercise
 * verification (that is what the tests below do). A truly plaintext probe
 * would not work here: the server's `pg_hba.conf` is `hostssl`-only, so a
 * non-TLS startup packet is rejected outright rather than merely refused for
 * "not ready yet".
 */
async function waitForPg(hostPort: number, timeoutMs = 60000): Promise<void> {
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const client = new pg.Client({
            host: "localhost",
            port: hostPort,
            user: "postgres",
            password: PGPASSWORD,
            database: "postgres",
            connectionTimeoutMillis: 5000,
            ssl: { rejectUnauthorized: false }
        });
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
                    `postgres at localhost:${hostPort} failed to accept TLS connections in ${
                        timeoutMs / 1000
                    }s: ${e}`
                );
            }
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
}

/**
 * TLS certificate-chain-verification error codes/messages Node's TLS stack
 * (and therefore node-postgres) can surface when a server's certificate does
 * not chain to a trusted CA. Used to prove the negative test fails for the
 * RIGHT reason -- a typo'd host or a closed port would throw too, but with a
 * completely different `code` (e.g. `ENOTFOUND`/`ECONNREFUSED`), and a sloppy
 * `expect(threw).to.equal(true)` assertion would not tell the two apart.
 */
const CERT_VERIFICATION_ERROR_CODES = [
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "CERT_HAS_EXPIRED",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "HOSTNAME_MISMATCH"
];

function isCertVerificationError(err: unknown): boolean {
    const code = (err as { code?: string } | undefined)?.code;
    if (code && CERT_VERIFICATION_ERROR_CODES.includes(code)) {
        return true;
    }
    const message = err instanceof Error ? err.message : String(err);
    return /certificate/i.test(message);
}

describe("DB client CA verification -- real getPgSslConfigFromEnv against a real TLS-enforcing PostgreSQL", function () {
    let hostPort: number;
    let certsDir: string; // real CA + server cert the server actually presents
    let bogusDir: string; // an unrelated CA the server cert does NOT chain to
    const hostTmpDirs: string[] = [];

    before(async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);

        certsDir = fs.mkdtempSync(path.join(os.tmpdir(), "ca-verify-real-"));
        hostTmpDirs.push(certsDir);
        makeCa(certsDir, "magda-test-ca");
        makeServerCert(certsDir);

        bogusDir = fs.mkdtempSync(path.join(os.tmpdir(), "ca-verify-bogus-"));
        hostTmpDirs.push(bogusDir);
        makeCa(bogusDir, "magda-test-bogus-ca");

        // hostssl-only: no plain `host` line at all, so TLS is genuinely
        // enforced (mirrors a managed DB that requires TLS), not merely
        // offered.
        fs.writeFileSync(
            `${certsDir}/pg_hba.conf`,
            [
                "local   all   all                trust",
                "hostssl all   all   0.0.0.0/0    md5",
                "hostssl all   all   ::/0         md5",
                ""
            ].join("\n")
        );

        docker(["network", "rm", "-f", NET], true);
        docker(["rm", "-f", PG], true);
        docker(["network", "create", NET]);

        // The official postgres image starts as root; the entrypoint later
        // drops to the "postgres" OS user via gosu. This overrides the
        // container's default command (keeping the image's own
        // docker-entrypoint.sh as the ENTRYPOINT is not possible once we
        // override it, so it is invoked explicitly below) so that, as root, it
        // copies EVERYTHING the server reads -- the certs AND pg_hba.conf --
        // out of /ca-verify-certs and into the postgres-owned home, then hands
        // over to the real entrypoint pointing only at those copies.
        //
        // Copying pg_hba.conf out (rather than pointing hba_file straight at
        // /ca-verify-certs/pg_hba.conf) is REQUIRED, not tidiness: `docker cp`
        // (see the create/cp/start note below) creates /ca-verify-certs owned
        // by root with the mode of the SOURCE dir, and the source is
        // `fs.mkdtempSync` -- mode 0700. The unprivileged "postgres" user the
        // server runs as therefore cannot even traverse /ca-verify-certs, so it
        // could not open a pg_hba.conf left there ("could not open file ...:
        // Permission denied", FATAL at startup). Only root (which runs this
        // bootScript) can read the 0700 dir, so root must be the one to relay
        // the files into postgres-owned space. The same reasoning is why the
        // certs are copied+chowned rather than read in place; pg_hba.conf was
        // the one file previously read in place, which broke once cert delivery
        // moved from a (perms-remapped) bind mount to `docker cp`.
        const bootScript = [
            "set -e",
            "cp /ca-verify-certs/server.crt /ca-verify-certs/server.key /ca-verify-certs/ca.crt /ca-verify-certs/pg_hba.conf /var/lib/postgresql/",
            "chown postgres:postgres /var/lib/postgresql/server.crt /var/lib/postgresql/server.key /var/lib/postgresql/ca.crt /var/lib/postgresql/pg_hba.conf",
            "chmod 600 /var/lib/postgresql/server.key",
            [
                "exec docker-entrypoint.sh postgres",
                "-c ssl=on",
                "-c ssl_cert_file=/var/lib/postgresql/server.crt",
                "-c ssl_key_file=/var/lib/postgresql/server.key",
                "-c ssl_ca_file=/var/lib/postgresql/ca.crt",
                "-c hba_file=/var/lib/postgresql/pg_hba.conf"
            ].join(" ")
        ].join(" && ");

        // Deliver the certs and start the server WITHOUT a host bind-mount.
        // In CI the docker daemon is a SEPARATE `docker:dind` service, so
        // `-v ${certsDir}:/ca-verify-certs` would be resolved on the daemon's
        // OWN filesystem -- where this test's mkdtemp dir does not exist -- and
        // would silently mount an EMPTY directory. The bootScript's `cp` would
        // then fail under `set -e`, the container would exit before postgres
        // ever started, and getHostPort's `docker port` would report the opaque
        // "no public port '5432' published" (observed as a CI "flake"; it
        // passes locally only because a local daemon shares this filesystem).
        // `docker cp` streams the files to the daemon over the Docker API, so
        // it works whether or not the daemon shares our filesystem -- the same
        // reason postgresMajorUpgrade.spec.ts uses a named volume, not a
        // bind-mount. Files must exist before `start` (postgres reads them at
        // initdb), so the order is create -> cp -> start.
        docker([
            "create",
            "--name",
            PG,
            "--network",
            NET,
            "--network-alias",
            PG,
            "-p",
            "5432",
            "-e",
            `POSTGRES_PASSWORD=${PGPASSWORD}`,
            "--entrypoint",
            "bash",
            SERVER_IMAGE,
            "-c",
            bootScript
        ]);
        // `${certsDir}/.` copies the directory CONTENTS into /ca-verify-certs
        // (docker cp creates the dir if absent), matching the bootScript paths.
        docker(["cp", `${certsDir}/.`, `${PG}:/ca-verify-certs`]);
        docker(["start", PG]);
        assertContainerRunning(PG);

        hostPort = getHostPort(PG, 5432);
        await waitForPg(hostPort);
    });

    after(function (this) {
        this.timeout(30000);
        docker(["rm", "-f", PG], true);
        docker(["network", "rm", "-f", NET], true);
        for (const dir of hostTmpDirs) {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
            } catch {
                // best-effort
            }
        }
    });

    it("verify-full connects and queries successfully when the CA matches (real getPgSslConfigFromEnv)", async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        const ssl = getPgSslConfigFromEnv({
            PGSSLMODE: "verify-full",
            PGSSLROOTCERT: `${certsDir}/ca.crt`
        });
        const client = new pg.Client({
            host: "localhost",
            port: hostPort,
            user: "postgres",
            password: PGPASSWORD,
            database: "postgres",
            ssl: ssl as any
        });
        await client.connect();
        try {
            const r = await client.query("SELECT 1 AS ok");
            expect(r.rows[0].ok).to.equal(1);
        } finally {
            await client.end();
        }
    });

    it("verify-full REJECTS the connection with a certificate-verification error when the CA does not match (verification really happens)", async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        // A different, unrelated CA. The server's certificate was signed by
        // certsDir's CA, not this one, so a genuinely-verifying client MUST
        // reject it.
        const ssl = getPgSslConfigFromEnv({
            PGSSLMODE: "verify-full",
            PGSSLROOTCERT: `${bogusDir}/ca.crt`
        });
        const client = new pg.Client({
            host: "localhost",
            port: hostPort,
            user: "postgres",
            password: PGPASSWORD,
            database: "postgres",
            ssl: ssl as any
        });
        let caught: unknown;
        try {
            await client.connect();
        } catch (e) {
            caught = e;
        } finally {
            try {
                await client.end();
            } catch {
                // ignore -- client never fully connected
            }
        }
        expect(
            caught,
            "expected verify-full to reject a server certificate not signed by the trusted CA"
        ).to.not.equal(undefined);
        expect(
            isCertVerificationError(caught),
            `expected a certificate-verification error, got: ${
                caught instanceof Error ? caught.message : String(caught)
            } (code: ${(caught as any)?.code})`
        ).to.equal(true);
    });

    it("the cert-verification assertion is specific: a plain connectivity failure does NOT look like one (proves the negative test isn't sloppy)", async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        // Same correct CA, but a port nothing listens on -- a stand-in for
        // "a typo in the host" per the task brief: this must fail too, but
        // for a completely different (connectivity, not certificate) reason.
        // If `isCertVerificationError` returned true here, it would prove the
        // negative test above could pass even when verification never ran.
        const ssl = getPgSslConfigFromEnv({
            PGSSLMODE: "verify-full",
            PGSSLROOTCERT: `${certsDir}/ca.crt`
        });
        const client = new pg.Client({
            host: "localhost",
            port: 1, // reserved/unused port: connection refused, not a TLS handshake
            user: "postgres",
            password: PGPASSWORD,
            database: "postgres",
            connectionTimeoutMillis: 5000,
            ssl: ssl as any
        });
        let caught: unknown;
        try {
            await client.connect();
        } catch (e) {
            caught = e;
        } finally {
            try {
                await client.end();
            } catch {
                // ignore
            }
        }
        expect(caught, "expected the bad-port connection to fail").to.not.equal(
            undefined
        );
        expect(
            isCertVerificationError(caught),
            `a connectivity error must not be classified as a certificate error, got: ${
                caught instanceof Error ? caught.message : String(caught)
            }`
        ).to.equal(false);
    });

    it("the real magda-core chart renders the fixed CA mount path and PGSSLROOTCERT for verify-full", function (this) {
        this.timeout(60000);
        const args = [
            "template",
            "ca-verify",
            CHART_DIR,
            "--set",
            "global.postgresql.client.sslmode=verify-full",
            "--set",
            "global.postgresql.client.sslRootCertSecret.name=my-ca",
            "--set",
            "global.enableMultiTenants=true",
            "--set",
            "registry-api.deployments.readOnly.enable=true"
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
        const rendered = res.stdout;

        expect(rendered).to.match(/secretName: "my-ca"/);
        expect(rendered).to.match(/path: root\.crt/);
        expect(rendered).to.match(/mountPath: \/etc\/magda\/postgresql-ca/);

        const m = rendered.match(
            /name: "PGSSLROOTCERT"\r?\n\s*value: "?([^"\r\n]+?)"?\r?\n/
        );
        expect(
            m,
            "expected a PGSSLROOTCERT env entry pointing at the mounted CA"
        ).to.not.equal(null);
        expect((m as RegExpMatchArray)[1]).to.equal(
            "/etc/magda/postgresql-ca/root.crt"
        );

        // `system` is never valid for any client class in this chart (libpq
        // <16 in the migrator image can't use it; a Node pod would
        // fs.readFileSync("system") and crash on boot).
        expect(rendered).to.not.match(
            /name: "PGSSLROOTCERT"\r?\n\s*value: "system"/
        );
    });

    it("psql (libpq) verifies the server through the same fixed CA mount path the chart renders", function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        // Mirrors the chart's fixed mount path (/etc/magda/postgresql-ca/root.crt,
        // asserted above) without deploying the chart -- this proves a libpq
        // client (as used by e.g. migrator/backup Jobs) genuinely verifies
        // against a CA delivered at that exact path, dialing the server by
        // its container name (covered by the cert's SAN) over the shared
        // docker network.
        const res = spawnSync(
            "docker",
            [
                "run",
                "--rm",
                "--network",
                NET,
                "-v",
                `${certsDir}/ca.crt:/etc/magda/postgresql-ca/root.crt:ro`,
                "-e",
                `PGPASSWORD=${PGPASSWORD}`,
                SERVER_IMAGE,
                "psql",
                `host=${PG} port=5432 user=postgres dbname=postgres sslmode=verify-full sslrootcert=/etc/magda/postgresql-ca/root.crt`,
                "-c",
                "SELECT 1 AS ok"
            ],
            { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
        );
        expect(
            res.status,
            `psql verify-full failed:\nSTDOUT:\n${res.stdout}\nSTDERR:\n${res.stderr}`
        ).to.equal(0);
        expect(res.stdout).to.include("ok");
    });

    it("psql (libpq) is likewise rejected by the wrong CA (the libpq leg verifies too, not just node-postgres)", function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        const res = spawnSync(
            "docker",
            [
                "run",
                "--rm",
                "--network",
                NET,
                "-v",
                `${bogusDir}/ca.crt:/etc/magda/postgresql-ca/root.crt:ro`,
                "-e",
                `PGPASSWORD=${PGPASSWORD}`,
                SERVER_IMAGE,
                "psql",
                `host=${PG} port=5432 user=postgres dbname=postgres sslmode=verify-full sslrootcert=/etc/magda/postgresql-ca/root.crt`,
                "-c",
                "SELECT 1"
            ],
            { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
        );
        expect(
            res.status,
            "expected psql verify-full to fail against a server not signed by the trusted CA"
        ).to.not.equal(0);
        expect(res.stderr.toLowerCase()).to.match(/certificate|ssl/);
    });
});
