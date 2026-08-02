import {} from "mocha";
import { expect } from "chai";
import { execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs-extra";
import os from "os";
import path from "path";
import pg from "pg";
import { v4 as uuidV4 } from "uuid";
import ServiceRunner from "../ServiceRunner.js";

/** WAL segment size (16 MiB), used as a sanity bound on fetched segments. */
const WAL_SEGMENT_SIZE = 16777216;

/** SHA-256 hex digest of a file's contents. */
function sha256File(filePath: string): string {
    return crypto
        .createHash("sha256")
        .update(fs.readFileSync(filePath))
        .digest("hex");
}

const ENV_SETUP_TIME_OUT = 600000; // 10 mins

// --- small local helpers -------------------------------------------------

/**
 * Run the docker CLI and return its trimmed stdout. `ignoreError` swallows a
 * non-zero exit (used by best-effort cleanup so one failure doesn't mask
 * others).
 */
function docker(args: string[], ignoreError = false): string {
    try {
        return execFileSync("docker", args, { encoding: "utf8" }).trim();
    } catch (e) {
        if (ignoreError) {
            return "";
        }
        throw e;
    }
}

// Host-path bind mounts do NOT work when the docker daemon is remote (e.g.
// GitLab dind: the daemon cannot see this test runner's filesystem). Files are
// therefore moved to/from the runWalg containers through NAMED VOLUMES, using
// `docker cp` (which streams through the daemon) against a short-lived helper.

/** Copy a host file into a named volume at `volPath` (dind-safe). */
function cpIntoVolume(vol: string, hostFile: string, volPath: string) {
    const h = `walg-cp-${uuidV4().slice(0, 8)}`;
    docker(["run", "-d", "--name", h, "-v", `${vol}:/vol`, "busybox", "sleep", "300"]);
    try {
        docker(["cp", hostFile, `${h}:/vol/${volPath}`]);
    } finally {
        docker(["rm", "-f", h], true);
    }
}

/** Copy a file out of a named volume to a host path (dind-safe). */
function cpFromVolume(vol: string, volPath: string, hostFile: string) {
    const h = `walg-cp-${uuidV4().slice(0, 8)}`;
    docker(["run", "-d", "--name", h, "-v", `${vol}:/vol`, "busybox", "sleep", "300"]);
    try {
        docker(["cp", `${h}:/vol/${volPath}`, hostFile]);
    } finally {
        docker(["rm", "-f", h], true);
    }
}

/**
 * Copy a completed WAL segment out of the source container and `wal-push` it,
 * sharing the file into the runWalg container via a named volume. Returns the
 * wal-g result and the host path of the segment copy (a byte-identity reference).
 */
async function walPushSegment(
    serviceRunner: ServiceRunner,
    container: string,
    seg: string,
    hostTmpDirs: string[],
    volumesToClean: string[]
): Promise<{ result: { exitCode: number; output: string }; hostSegPath: string }> {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "walg-seg-"));
    hostTmpDirs.push(tmp);
    const hostSegPath = path.join(tmp, seg);
    docker([
        "cp",
        `${container}:/var/lib/postgresql/data/pg_wal/${seg}`,
        hostSegPath
    ]);
    const vol = `walg-share-${uuidV4().slice(0, 8)}`;
    volumesToClean.push(vol);
    docker(["volume", "create", vol]);
    cpIntoVolume(vol, hostSegPath, seg);
    const result = await serviceRunner.runWalg(
        ["wal-push", `/share/${seg}`],
        {},
        [`${vol}:/share:ro`]
    );
    return { result, hostSegPath };
}

/** `wal-fetch` a segment into a named volume, then copy it out to `hostFile`. */
async function walFetchToHost(
    serviceRunner: ServiceRunner,
    seg: string,
    hostFile: string,
    volumesToClean: string[]
): Promise<{ exitCode: number; output: string }> {
    const vol = `walg-fetch-${uuidV4().slice(0, 8)}`;
    volumesToClean.push(vol);
    docker(["volume", "create", vol]);
    const result = await serviceRunner.runWalg(
        ["wal-fetch", seg, `/dest/${seg}`],
        {},
        [`${vol}:/dest`]
    );
    if (result.exitCode === 0) {
        cpFromVolume(vol, seg, hostFile);
    }
    return result;
}

/**
 * List object names under `prefix` in the wal-g bucket via the structured
 * MinIO client (NOT the CRLF-laden `runWalg().output`).
 */
function listWalgObjects(
    serviceRunner: ServiceRunner,
    prefix: string
): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        const names: string[] = [];
        const stream = serviceRunner.minioClient!.listObjectsV2(
            serviceRunner.walgBucket,
            prefix,
            true
        );
        stream.on("data", (o: any) => {
            if (o?.name) {
                names.push(o.name);
            }
        });
        stream.on("error", reject);
        stream.on("end", () => resolve(names));
    });
}

/** Build a pg client config for a plain-trust postgres on the given port. */
function pgConfig(host: string, port: number, password?: string) {
    return {
        host,
        port,
        user: "postgres",
        database: "postgres",
        password,
        // fail fast so the restore-readiness poll loops quickly
        connectionTimeoutMillis: 5000
    } as pg.ClientConfig;
}

/**
 * Poll `pg.Client` connect against the given config until it accepts a
 * connection or `timeoutMs` elapses (mirrors ServiceRunner.waitAlive).
 */
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
                    `Restore postgres failed to accept connections in ${
                        timeoutMs / 1000
                    }s: ${e}`
                );
            }
            await new Promise((r) => setTimeout(r, 1000));
        }
    }
}

/** Find the running source walg-postgres container name (there is exactly one). */
function sourceWalgContainer(): string {
    const name = docker([
        "ps",
        "--filter",
        "name=test-walg-postgres",
        "--format",
        "{{.Names}}"
    ])
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)[0];
    if (!name) {
        throw new Error("source walg-postgres container not found");
    }
    return name;
}

/**
 * Restore the LATEST base backup into a fresh instance and start postgres on
 * it, pre-staging `segments` into pg_wal so recovery can replay them. The plain
 * postgres image has no `restore_command`, so whatever is present in pg_wal
 * bounds how far recovery rolls forward; with no `recovery_target` set,
 * postgres replays to the end of the staged WAL and promotes.
 */
async function restoreLatestBackup(
    serviceRunner: ServiceRunner,
    opts: {
        vol: string;
        name: string;
        port: number;
        segments: string[];
        // when set, passed as postgres `recovery_target` (e.g. "immediate",
        // which mirrors the shipped magda-postgres recovery.conf and stops
        // replay at the base-backup consistency point). Omit to roll forward
        // to the end of the staged WAL.
        recoveryTarget?: string;
    }
): Promise<void> {
    docker(["volume", "create", opts.vol]);
    const fetched = await serviceRunner.runWalg(
        ["backup-fetch", "/restore", "LATEST"],
        {},
        [`${opts.vol}:/restore`]
    );
    if (fetched.exitCode !== 0) {
        throw new Error(`backup-fetch failed: ${fetched.output}`);
    }
    for (const seg of opts.segments) {
        const walFetch = await serviceRunner.runWalg(
            ["wal-fetch", seg, `/restore/pg_wal/${seg}`],
            {},
            [`${opts.vol}:/restore`]
        );
        if (walFetch.exitCode !== 0) {
            throw new Error(`wal-fetch ${seg} failed: ${walFetch.output}`);
        }
    }
    // `recovery.signal` puts postgres into ARCHIVE recovery (not crash recovery),
    // so it rolls forward through the staged WAL past the base-backup consistency
    // point instead of stopping at it. With no `recovery_target`, replay runs to
    // the end of the available WAL and then promotes.
    docker([
        "run",
        "--rm",
        "-v",
        `${opts.vol}:/restore`,
        "--user",
        "0",
        "--entrypoint",
        "sh",
        "postgres:13.7",
        "-c",
        "touch /restore/recovery.signal && chown -R 999:999 /restore && chmod 700 /restore"
    ]);
    // PG13 refuses archive recovery without a restore_command. The plain image
    // has no wal-g, so we point it at `/bin/false`: every archive fetch "misses",
    // postgres falls back to the segments pre-staged in pg_wal, replays them, and
    // ends recovery (promotes) once the next segment is neither in the archive nor
    // pg_wal. No recovery_target => it rolls forward to the end of the staged WAL.
    const pgArgs = [
        "run",
        "-d",
        "--name",
        opts.name,
        "-p",
        `${opts.port}:5432`,
        "-v",
        `${opts.vol}:/var/lib/postgresql/data`,
        "postgres:13.7",
        "-c",
        "restore_command=/bin/false"
    ];
    if (opts.recoveryTarget) {
        pgArgs.push(
            "-c",
            `recovery_target=${opts.recoveryTarget}`,
            "-c",
            "recovery_target_action=promote"
        );
    }
    docker(pgArgs);
    await serviceRunner.createPortForward(opts.port);
    const host = serviceRunner.dockerServiceForwardHost || "localhost";
    try {
        await waitForPg(pgConfig(host, opts.port));
    } catch (e) {
        const logs = docker(["logs", "--tail", "80", opts.name], true);
        throw new Error(`${e}\n--- restore postgres logs ---\n${logs}`);
    }
}

describe("wal-g backup / restore integration tests", () => {
    const serviceRunner = new ServiceRunner();
    serviceRunner.enableWalg = true;

    const runId = uuidV4().slice(0, 8);
    const restoreVol = `walg-restore-vol-${runId}`;
    const restoreName = `walg-restore-pg-${runId}`;
    const restorePort = 5433;
    const hostTmpDirs: string[] = [];
    // additional restore instances (name/vol/port) to tear down in `after`.
    const extraRestores: { name: string; vol: string; port: number }[] = [];
    // named volumes used to shuttle WAL segments to/from the runWalg containers.
    const volumesToClean: string[] = [];

    before(async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        await serviceRunner.create();
    });

    after(async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        // best-effort cleanup of the restore instance + volume + host tmp dirs,
        // running regardless of assertion outcome.
        try {
            await serviceRunner.destroyPortForward(restorePort);
        } catch {
            // no-op if no forward exists (e.g. not on k8s)
        }
        docker(["rm", "-f", restoreName], true);
        docker(["volume", "rm", restoreVol], true);
        for (const r of extraRestores) {
            try {
                await serviceRunner.destroyPortForward(r.port);
            } catch {
                // no-op if no forward exists (e.g. not on k8s)
            }
            docker(["rm", "-f", r.name], true);
            docker(["volume", "rm", r.vol], true);
        }
        for (const vol of volumesToClean) {
            docker(["volume", "rm", "-f", vol], true);
        }
        for (const dir of hostTmpDirs) {
            try {
                fs.removeSync(dir);
            } catch {
                // ignore
            }
        }
        await serviceRunner.destroy();
    });

    it("wal-g backup base-backup round-trip preserves data, sequence, owner and extension", async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);

        const host = serviceRunner.dockerServiceForwardHost || "localhost";

        // 1. Load the fixture into the source postgres.
        const source = new pg.Client(pgConfig(host, 5432, "password"));
        await source.connect();
        try {
            await source.query("CREATE ROLE appowner;");
            await source.query("CREATE EXTENSION pgcrypto;");
            await source.query(
                "CREATE TABLE t(id bigserial primary key, v text);"
            );
            await source.query(
                "INSERT INTO t(v) SELECT 'row ' || g FROM generate_series(1, 500) g;"
            );
            await source.query("ALTER TABLE t OWNER TO appowner;");
            await source.query("SELECT setval('t_id_seq', 90000);");
            await source.query("CHECKPOINT;");
        } finally {
            await source.end();
        }

        // 2. Base backup (remote form; runWalg invokes wal-g as root).
        const push = await serviceRunner.runWalg(["backup-push"]);
        expect(push.exitCode).to.equal(0);

        // 3. Assert >=1 base backup object and extract the backup-start segment.
        const baseObjects = await listWalgObjects(
            serviceRunner,
            "pg/basebackups_005/"
        );
        expect(baseObjects.length).to.be.greaterThan(0);

        const baseNameMatch = baseObjects
            .map((name) => name.match(/base_([0-9A-Fa-f]{24})/))
            .find((m) => m !== null);
        expect(baseNameMatch, "could not find base_<segment> object").to.not
            .be.undefined;
        const seg = baseNameMatch![1];

        // 4. backup-push does NOT archive WAL (archive_mode off). Complete the
        // backup-start segment, copy it out of the running source container and
        // wal-push it so restore recovery can replay to consistency.
        const switchClient = new pg.Client(pgConfig(host, 5432, "password"));
        await switchClient.connect();
        try {
            await switchClient.query("SELECT pg_switch_wal();");
        } finally {
            await switchClient.end();
        }

        const sourceContainer = sourceWalgContainer();
        const { result: walPush } = await walPushSegment(
            serviceRunner,
            sourceContainer,
            seg,
            hostTmpDirs,
            volumesToClean
        );
        expect(
            walPush.exitCode,
            `wal-push failed: ${walPush.output}`
        ).to.equal(0);

        const walObjects = await listWalgObjects(serviceRunner, "pg/wal_005/");
        expect(walObjects).to.include(`pg/wal_005/${seg}.lz4`);

        // 5. Restore into a fresh instance (exact handoff from spike findings).
        docker(["volume", "create", restoreVol]);

        const fetch = await serviceRunner.runWalg(
            ["backup-fetch", "/restore", "LATEST"],
            {},
            [`${restoreVol}:/restore`]
        );
        expect(fetch.exitCode, `backup-fetch failed: ${fetch.output}`).to.equal(
            0
        );

        const walFetch = await serviceRunner.runWalg(
            ["wal-fetch", seg, `/restore/pg_wal/${seg}`],
            {},
            [`${restoreVol}:/restore`]
        );
        expect(
            walFetch.exitCode,
            `wal-fetch failed: ${walFetch.output}`
        ).to.equal(0);

        // fix ownership/mode for the postgres uid (999) using a helper container
        docker([
            "run",
            "--rm",
            "-v",
            `${restoreVol}:/restore`,
            "--user",
            "0",
            "--entrypoint",
            "sh",
            "postgres:13.7",
            "-c",
            "chown -R 999:999 /restore && chmod 700 /restore"
        ]);

        // start a fresh postgres on the fetched datadir (already initialised ->
        // entrypoint skips initdb and drives recovery via backup_label)
        docker([
            "run",
            "-d",
            "--name",
            restoreName,
            "-p",
            `${restorePort}:5432`,
            "-v",
            `${restoreVol}:/var/lib/postgresql/data`,
            "postgres:13.7"
        ]);

        // In the k8s/dind CI runner, published ports need the same socat bridge
        // the framework sets up for its own services; a no-op locally (not on
        // k8s).
        await serviceRunner.createPortForward(restorePort);

        try {
            await waitForPg(
                pgConfig(
                    serviceRunner.dockerServiceForwardHost || "localhost",
                    restorePort
                )
            );
        } catch (e) {
            // surface recovery logs to aid debugging if postgres never opened
            const logs = docker(["logs", "--tail", "80", restoreName], true);
            throw new Error(`${e}\n--- restore postgres logs ---\n${logs}`);
        }

        // 6. Assert data fidelity on the RESTORED instance (no password).
        const restored = new pg.Client(
            pgConfig(
                serviceRunner.dockerServiceForwardHost || "localhost",
                restorePort
            )
        );
        await restored.connect();
        try {
            const countRes = await restored.query(
                "SELECT count(*)::int AS c FROM t"
            );
            expect(countRes.rows[0].c).to.equal(500);

            const seqRes = await restored.query(
                "SELECT last_value FROM t_id_seq"
            );
            expect(Number(seqRes.rows[0].last_value)).to.be.at.least(90000);

            const ownerRes = await restored.query(
                "SELECT r.rolname FROM pg_class c JOIN pg_roles r ON c.relowner = r.oid WHERE c.relname = 't'"
            );
            expect(ownerRes.rows[0].rolname).to.equal("appowner");

            const extRes = await restored.query(
                "SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'"
            );
            expect(extRes.rows.length).to.equal(1);
        } finally {
            await restored.end();
        }
    });

    it("wal-g WAL push/fetch round-trip is byte-identical", async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);

        const host = serviceRunner.dockerServiceForwardHost || "localhost";

        // 1. Write a row for content, then capture the CURRENT segment and
        // force a WAL switch so that segment becomes complete/archivable.
        const source = new pg.Client(pgConfig(host, 5432, "password"));
        await source.connect();
        let seg: string;
        try {
            await source.query(
                "CREATE TABLE IF NOT EXISTS wal_marker(id bigserial primary key, v text);"
            );
            await source.query("INSERT INTO wal_marker(v) VALUES ('marker');");
            const segRes = await source.query(
                "SELECT pg_walfile_name(pg_current_wal_lsn()) AS s"
            );
            seg = segRes.rows[0].s;
            await source.query("SELECT pg_switch_wal();");
        } finally {
            await source.end();
        }

        // 2. Copy the now-completed segment out of the source container and
        // wal-push it (through a named volume). The returned host path is the
        // byte-identity reference copy.
        const sourceContainer = sourceWalgContainer();
        const { result: walPush, hostSegPath: referencePath } =
            await walPushSegment(
                serviceRunner,
                sourceContainer,
                seg,
                hostTmpDirs,
                volumesToClean
            );
        expect(
            walPush.exitCode,
            `wal-push failed: ${walPush.output}`
        ).to.equal(0);

        // 3. Assert the pushed segment object exists in MinIO.
        const walObjects = await listWalgObjects(serviceRunner, "pg/wal_005/");
        expect(walObjects).to.include(`pg/wal_005/${seg}.lz4`);

        // 4. wal-fetch it back out to a host file.
        const fetchDir = fs.mkdtempSync(
            path.join(os.tmpdir(), "walg-wal-dest-")
        );
        hostTmpDirs.push(fetchDir);
        const fetchedPath = path.join(fetchDir, seg);
        const walFetch = await walFetchToHost(
            serviceRunner,
            seg,
            fetchedPath,
            volumesToClean
        );
        expect(
            walFetch.exitCode,
            `wal-fetch failed: ${walFetch.output}`
        ).to.equal(0);

        // 5. Byte-identity assertion: fetched file matches the reference copy
        // taken directly from the source's pg_wal, and is a sane WAL segment
        // size.
        const fetchedSize = fs.statSync(fetchedPath).size;
        expect(fetchedSize).to.be.greaterThan(0);
        expect(fetchedSize % WAL_SEGMENT_SIZE).to.equal(0);
        expect(sha256File(fetchedPath)).to.equal(sha256File(referencePath));
    });

    it("wal-g point-in-time roll-forward recovers writes made after the base backup", async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);

        const host = serviceRunner.dockerServiceForwardHost || "localhost";

        // 1. Create a table with a known row count and take a base backup.
        const source = new pg.Client(pgConfig(host, 5432, "password"));
        await source.connect();
        try {
            await source.query(
                "CREATE TABLE pitr(id bigserial primary key, v text);"
            );
            await source.query(
                "INSERT INTO pitr(v) SELECT 'base ' || g FROM generate_series(1, 100) g;"
            );
            await source.query("CHECKPOINT;");
        } finally {
            await source.end();
        }

        const push = await serviceRunner.runWalg(["backup-push"]);
        expect(push.exitCode, `backup-push failed: ${push.output}`).to.equal(0);

        // Identify the base-backup start segment (the latest base_<seg>).
        const baseObjects = await listWalgObjects(
            serviceRunner,
            "pg/basebackups_005/"
        );
        const baseSegments = baseObjects
            .map((n) => n.match(/base_([0-9A-Fa-f]{24})/))
            .filter((m): m is RegExpMatchArray => m !== null)
            .map((m) => m[1]);
        expect(baseSegments.length, "no base_<segment> object found").to.be.greaterThan(
            0
        );
        const startSeg = baseSegments.sort().reverse()[0];

        // 2. Write MORE rows AFTER the base backup - these exist ONLY in the WAL,
        // not in the base backup, then complete the segment(s) holding them.
        const source2 = new pg.Client(pgConfig(host, 5432, "password"));
        await source2.connect();
        // The WAL segment that ends up holding the post-backup writes. Captured
        // from the *insert* LSN (mid-segment) BEFORE the switch: reading
        // pg_walfile_name(pg_current_wal_lsn()) AFTER the switch lands on an exact
        // segment boundary and reports the just-completed segment, which is
        // off-by-one for a range upper bound.
        let lastSeg: string;
        try {
            await source2.query(
                "INSERT INTO pitr(v) SELECT 'wal ' || g FROM generate_series(1, 50) g;"
            );
            lastSeg = (
                await source2.query(
                    "SELECT pg_walfile_name(pg_current_wal_insert_lsn()) AS s"
                )
            ).rows[0].s;
            // complete `lastSeg` so it can be archived
            await source2.query("SELECT pg_switch_wal();");
        } finally {
            await source2.end();
        }

        // 3. Archive every completed segment from the base-backup start up to
        // (but not including) the current active segment. backup-push archives
        // no WAL here (archive_mode is off), so push them explicitly - this is
        // the continuous-archiving stream the restore will roll forward through.
        const container = sourceWalgContainer();
        const listing = docker([
            "exec",
            container,
            "sh",
            "-c",
            "ls /var/lib/postgresql/data/pg_wal"
        ]);
        const segments = listing
            .split(/\s+/)
            .map((s) => s.trim())
            .filter((s) => /^[0-9A-Fa-f]{24}$/.test(s))
            // [base-backup start .. the segment holding the post-backup writes],
            // inclusive. pg_wal also contains the current active segment and
            // pre-allocated future segments, which must NOT be staged.
            .filter((s) => s >= startSeg && s <= lastSeg)
            .sort();
        expect(
            segments.length,
            "expected at least one completed WAL segment to archive"
        ).to.be.greaterThan(0);

        for (const seg of segments) {
            const { result: walPush } = await walPushSegment(
                serviceRunner,
                container,
                seg,
                hostTmpDirs,
                volumesToClean
            );
            expect(
                walPush.exitCode,
                `wal-push ${seg} failed: ${walPush.output}`
            ).to.equal(0);
        }

        // 4. Restore into a fresh instance, pre-staging ALL archived segments,
        // and let recovery roll forward (no recovery_target) to the end of WAL.
        const vol = `walg-rollfwd-vol-${runId}`;
        const name = `walg-rollfwd-pg-${runId}`;
        const port = 5434;
        extraRestores.push({ name, vol, port });
        await restoreLatestBackup(serviceRunner, { vol, name, port, segments });

        // 5. Assert the post-backup rows were recovered via WAL replay: 100 base
        // rows + 50 rows that existed ONLY in the archived WAL.
        const restored = new pg.Client(
            pgConfig(serviceRunner.dockerServiceForwardHost || "localhost", port)
        );
        await restored.connect();
        try {
            const countRes = await restored.query(
                "SELECT count(*)::int AS c FROM pitr"
            );
            expect(countRes.rows[0].c).to.equal(150);
        } finally {
            await restored.end();
        }
    });

    it("wal-g recovery_target=immediate stops at the base backup (no roll-forward)", async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);

        const host = serviceRunner.dockerServiceForwardHost || "localhost";

        // 1. Fresh table with a known base count, then a base backup.
        const source = new pg.Client(pgConfig(host, 5432, "password"));
        await source.connect();
        try {
            await source.query(
                "CREATE TABLE pitr_immediate(id bigserial primary key, v text);"
            );
            await source.query(
                "INSERT INTO pitr_immediate(v) SELECT 'base ' || g FROM generate_series(1, 100) g;"
            );
            await source.query("CHECKPOINT;");
        } finally {
            await source.end();
        }

        const push = await serviceRunner.runWalg(["backup-push"]);
        expect(push.exitCode, `backup-push failed: ${push.output}`).to.equal(0);

        const baseObjects = await listWalgObjects(
            serviceRunner,
            "pg/basebackups_005/"
        );
        const startSeg = baseObjects
            .map((n) => n.match(/base_([0-9A-Fa-f]{24})/))
            .filter((m): m is RegExpMatchArray => m !== null)
            .map((m) => m[1])
            .sort()
            .reverse()[0];
        expect(startSeg, "no base_<segment> object found").to.not.be.undefined;

        // 2. Post-backup writes that exist ONLY in the WAL.
        const source2 = new pg.Client(pgConfig(host, 5432, "password"));
        await source2.connect();
        let lastSeg: string;
        try {
            await source2.query(
                "INSERT INTO pitr_immediate(v) SELECT 'wal ' || g FROM generate_series(1, 50) g;"
            );
            lastSeg = (
                await source2.query(
                    "SELECT pg_walfile_name(pg_current_wal_insert_lsn()) AS s"
                )
            ).rows[0].s;
            await source2.query("SELECT pg_switch_wal();");
        } finally {
            await source2.end();
        }

        // 3. Archive the same WAL range the roll-forward test would.
        const container = sourceWalgContainer();
        const listing = docker([
            "exec",
            container,
            "sh",
            "-c",
            "ls /var/lib/postgresql/data/pg_wal"
        ]);
        const segments = listing
            .split(/\s+/)
            .map((s) => s.trim())
            .filter((s) => /^[0-9A-Fa-f]{24}$/.test(s))
            .filter((s) => s >= startSeg && s <= lastSeg)
            .sort();

        for (const seg of segments) {
            const { result: walPush } = await walPushSegment(
                serviceRunner,
                container,
                seg,
                hostTmpDirs,
                volumesToClean
            );
            expect(
                walPush.exitCode,
                `wal-push ${seg} failed: ${walPush.output}`
            ).to.equal(0);
        }

        // 4. Restore with the SHIPPED production setting recovery_target=immediate:
        // identical staged WAL to the roll-forward test, but replay must STOP at
        // the base-backup consistency point instead of rolling forward.
        const vol = `walg-immediate-vol-${runId}`;
        const name = `walg-immediate-pg-${runId}`;
        const port = 5435;
        extraRestores.push({ name, vol, port });
        await restoreLatestBackup(serviceRunner, {
            vol,
            name,
            port,
            segments,
            recoveryTarget: "immediate"
        });

        // 5. The 50 post-backup rows must NOT be present: recovery_target=immediate
        // recovers only to the base backup (the RPO gap #3754 addresses). This is
        // the same setup as the roll-forward test, changing ONLY recovery_target.
        const restored = new pg.Client(
            pgConfig(serviceRunner.dockerServiceForwardHost || "localhost", port)
        );
        await restored.connect();
        try {
            const countRes = await restored.query(
                "SELECT count(*)::int AS c FROM pitr_immediate"
            );
            expect(countRes.rows[0].c).to.equal(100);
        } finally {
            await restored.end();
        }
    });

    it("cross-version: a base backup + WAL pushed by 1.1.0 restores under 3.0.8", async function (this) {
        this.timeout(ENV_SETUP_TIME_OUT);
        const host = serviceRunner.dockerServiceForwardHost || "localhost";

        // Seed a known fixture.
        const source = new pg.Client(pgConfig(host, 5432, "password"));
        await source.connect();
        try {
            await source.query(
                "CREATE TABLE xver(id bigserial primary key, v text);"
            );
            await source.query(
                "INSERT INTO xver(v) SELECT 'row ' || g FROM generate_series(1, 200) g;"
            );
            await source.query("CHECKPOINT;");
        } finally {
            await source.end();
        }

        // PUSH with the OLD version (1.1.0): base backup + the start segment.
        serviceRunner.walgImgTag = "1.1.0";
        const push = await serviceRunner.runWalg(["backup-push"]);
        expect(push.exitCode, `1.1.0 backup-push failed: ${push.output}`).to.equal(0);

        const baseObjects = await listWalgObjects(
            serviceRunner,
            "pg/basebackups_005/"
        );
        const startSeg = baseObjects
            .map((n) => n.match(/base_([0-9A-Fa-f]{24})/))
            .filter((m): m is RegExpMatchArray => m !== null)
            .map((m) => m[1])
            .sort()
            .reverse()[0];
        expect(startSeg, "no base_<segment> object found").to.not.be.undefined;

        const switchClient = new pg.Client(pgConfig(host, 5432, "password"));
        await switchClient.connect();
        try {
            await switchClient.query("SELECT pg_switch_wal();");
        } finally {
            await switchClient.end();
        }
        const container = sourceWalgContainer();
        const { result: walPush } = await walPushSegment(
            serviceRunner,
            container,
            startSeg,
            hostTmpDirs,
            volumesToClean
        );
        expect(walPush.exitCode, `1.1.0 wal-push failed: ${walPush.output}`).to.equal(0);

        // RESTORE with the NEW version (3.0.8): fetch + start postgres.
        serviceRunner.walgImgTag = "3.0.8";
        const vol = `walg-xver-vol-${runId}`;
        const name = `walg-xver-pg-${runId}`;
        const port = 5436;
        extraRestores.push({ name, vol, port });
        await restoreLatestBackup(serviceRunner, {
            vol,
            name,
            port,
            segments: [startSeg]
        });

        const restored = new pg.Client(
            pgConfig(serviceRunner.dockerServiceForwardHost || "localhost", port)
        );
        await restored.connect();
        try {
            const countRes = await restored.query(
                "SELECT count(*)::int AS c FROM xver"
            );
            expect(countRes.rows[0].c).to.equal(200);
        } finally {
            await restored.end();
            // leave the default tag as the suite default for any later specs
            serviceRunner.walgImgTag = "3.0.8";
        }
    });
});
