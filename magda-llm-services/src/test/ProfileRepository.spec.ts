import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { sqls } from "sql-syntax";
import ProfileRepository from "../profiles/ProfileRepository.js";
import { ProfileFields } from "../profiles/types.js";
import { createTestDatabase } from "./testDb.js";

const FIELDS: ProfileFields = {
    name: "Finance models",
    description: "For Finance",
    allowedModels: ["model-a", "model-b"],
    enabled: true,
    orgUnitId: "00000000-0000-4000-8000-00000000f000",
    constraintExemption: false,
    allowedDailyTokens: 100000,
    allowedWeeklyTokens: null,
    allowedMonthlyTokens: 9007199254740991
};

const MANAGER = "00000000-0000-4000-8000-000000000001";

describe("ProfileRepository (integration)", function (this: Mocha.Suite) {
    this.timeout(30000);
    let pool: pg.Pool;
    let drop: () => Promise<void>;
    let repo: ProfileRepository;

    before(async () => {
        ({ pool, drop } = await createTestDatabase("profiles"));
        repo = new ProfileRepository(pool);
    });

    after(async () => {
        await drop();
    });

    async function createReady(fields: Partial<ProfileFields> = {}) {
        const pending = await repo.createPending(
            { ...FIELDS, ...fields },
            MANAGER
        );
        return (await repo.markReady(pending.id, randomUUID()))!;
    }

    it("creates a pending profile without a permission, then marks it ready", async () => {
        const pending = await repo.createPending(FIELDS, MANAGER);
        assert.equal(pending.state, "pending");
        assert.equal(pending.usePermissionId, null);
        assert.equal(pending.revision, 1);
        assert.deepEqual(pending.allowedModels, ["model-a", "model-b"]);
        assert.equal(pending.allowedDailyTokens, 100000);
        assert.equal(pending.allowedWeeklyTokens, null);
        assert.equal(pending.allowedMonthlyTokens, Number.MAX_SAFE_INTEGER);
        assert.equal(pending.createdBy, MANAGER);

        const permissionId = randomUUID();
        const ready = await repo.markReady(pending.id, permissionId);
        assert.ok(ready);
        assert.equal(ready.state, "ready");
        assert.equal(ready.usePermissionId, permissionId);
        assert.equal(ready.revision, 2);

        // only a pending profile can be marked ready
        assert.equal(await repo.markReady(pending.id, randomUUID()), null);
    });

    it("enforces the schema constraints", async () => {
        const id = randomUUID();
        await assert.rejects(
            pool.query(
                `INSERT INTO access_profiles (id, name, allowed_models, state) VALUES ($1, 'x', ARRAY['m'], 'ready')`,
                [id]
            ),
            /check/i,
            "a ready profile needs a permission"
        );
        await assert.rejects(
            pool.query(
                `INSERT INTO access_profiles (id, name, allowed_models, allowed_daily_tokens) VALUES ($1, 'x', ARRAY['m'], -1)`,
                [id]
            ),
            /check/i,
            "limits can't be negative"
        );
        await assert.rejects(
            pool.query(
                `INSERT INTO access_profiles (id, name, allowed_models) VALUES ($1, ' ', ARRAY['m'])`,
                [id]
            ),
            /check/i,
            "names can't be blank"
        );
        await assert.rejects(
            pool.query(
                `INSERT INTO access_profiles (id, name, allowed_models) VALUES ($1, 'x', ARRAY[]::text[])`,
                [id]
            ),
            /check/i,
            "allowed models can't be empty"
        );
        const a = await createReady();
        const b = await repo.createPending(FIELDS, MANAGER);
        await assert.rejects(
            repo.markReady(b.id, a.usePermissionId!),
            /unique/i,
            "a permission belongs to one profile"
        );
    });

    it("updates with the expected revision only (DATA-4)", async () => {
        const profile = await createReady();
        const changed = { ...FIELDS, name: "Renamed", allowedModels: ["*"] };

        const stale = await repo.update(
            profile.id,
            profile.revision - 1,
            changed,
            MANAGER
        );
        assert.equal(stale.status, "stale");

        const updated = await repo.update(
            profile.id,
            profile.revision,
            changed,
            MANAGER
        );
        assert.equal(updated.status, "updated");
        if (updated.status !== "updated") return;
        assert.equal(updated.profile.name, "Renamed");
        assert.deepEqual(updated.profile.allowedModels, ["*"]);
        assert.equal(updated.profile.revision, profile.revision + 1);
        // the permission and state are never changed by an update
        assert.equal(updated.profile.usePermissionId, profile.usePermissionId);
        assert.equal(updated.profile.state, "ready");

        // a second update with the old revision is stale
        const again = await repo.update(
            profile.id,
            profile.revision,
            FIELDS,
            MANAGER
        );
        assert.equal(again.status, "stale");

        assert.equal(
            (await repo.update(randomUUID(), 1, FIELDS, MANAGER)).status,
            "not_found"
        );
    });

    it("marks a profile deleting, disabling it, and only then deletes it (LIFE-4)", async () => {
        const profile = await createReady();
        assert.equal(await repo.delete(profile.id), false, "ready rows stay");
        const result = await repo.markDeleting(profile.id);
        assert.equal(result.status, "deleting");
        if (result.status !== "deleting") return;
        const deleting = result.profile;
        assert.equal(deleting.state, "deleting");
        assert.equal(deleting.revision, profile.revision + 1);
        assert.equal(deleting.enabled, false);
        assert.equal(
            (await repo.update(profile.id, deleting.revision, FIELDS, MANAGER))
                .status,
            "stale",
            "a deleting profile can't be updated"
        );
        assert.equal(await repo.delete(profile.id), true);
        assert.equal(await repo.get(profile.id), null);
    });

    it("repeats markDeleting idempotently, without bumping the revision again", async () => {
        const profile = await createReady();
        const first = await repo.markDeleting(profile.id);
        const second = await repo.markDeleting(profile.id);
        assert.equal(first.status, "deleting");
        assert.equal(second.status, "deleting");
        if (first.status !== "deleting" || second.status !== "deleting") return;
        assert.equal(second.profile.revision, first.profile.revision);
    });

    it("doesn't move a pending profile to deleting: it is abandoned through reconcile instead", async () => {
        const pending = await repo.createPending(FIELDS, MANAGER);
        const result = await repo.markDeleting(pending.id);
        assert.equal(result.status, "pending");
        const stored = await repo.get(pending.id);
        assert.equal(stored?.state, "pending");
        assert.equal(stored?.revision, pending.revision);
        assert.equal(await repo.delete(pending.id), true);
    });

    it("reports a missing profile for markDeleting", async () => {
        assert.equal(
            (await repo.markDeleting(randomUUID())).status,
            "not_found"
        );
    });

    it("abandons a pending profile and lists profiles to reconcile (LIFE-5)", async () => {
        const pending = await repo.createPending(FIELDS, MANAGER);
        const states = (await repo.listByState(["pending"])).map((p) => p.id);
        assert.ok(states.includes(pending.id));
        assert.equal(await repo.delete(pending.id), true);
    });

    it("replaces a missing permission only when it is still the recorded one", async () => {
        const profile = await createReady();
        const replacement = randomUUID();
        assert.equal(
            await repo.replacePermission(profile.id, randomUUID(), replacement),
            null
        );
        const repaired = await repo.replacePermission(
            profile.id,
            profile.usePermissionId!,
            replacement
        );
        assert.ok(repaired);
        assert.equal(repaired.usePermissionId, replacement);
        assert.equal(repaired.revision, profile.revision + 1);
    });

    it("lists with search, paging, states and an injected condition over alias p", async () => {
        const { pool: listPool, drop: dropList } = await createTestDatabase(
            "profile_list"
        );
        try {
            const listRepo = new ProfileRepository(listPool);
            const names = ["Alpha", "beta", "Gamma 100%", "Delta"];
            const created: Record<string, string> = {};
            for (const name of names) {
                const p = await listRepo.createPending(
                    { ...FIELDS, name },
                    MANAGER
                );
                await listRepo.markReady(p.id, randomUUID());
                created[name] = p.id;
            }
            await listRepo.markDeleting(created["Delta"]);

            const all = await listRepo.list();
            assert.equal(all.total, 4);
            assert.deepEqual(
                all.items.map((p) => p.name),
                ["Alpha", "beta", "Delta", "Gamma 100%"]
            );

            const page = await listRepo.list({ offset: 1, limit: 2 });
            assert.equal(page.total, 4);
            assert.deepEqual(
                page.items.map((p) => p.name),
                ["beta", "Delta"]
            );

            // `%` is matched literally
            const search = await listRepo.list({ search: "100%" });
            assert.deepEqual(
                search.items.map((p) => p.name),
                ["Gamma 100%"]
            );
            assert.equal((await listRepo.list({ search: "A" })).total, 4);

            const ready = await listRepo.list({ states: ["ready"] });
            assert.equal(ready.total, 3);

            const condition = sqls`p.id = ${created["beta"]}`;
            const conditioned = await listRepo.list({ condition });
            assert.deepEqual(
                conditioned.items.map((p) => p.name),
                ["beta"]
            );
            assert.equal(conditioned.total, 1);
        } finally {
            await dropList();
        }
    });
});
