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

    async function insert(fields: Partial<ProfileFields> = {}) {
        return repo.insert(
            randomUUID(),
            randomUUID(),
            { ...FIELDS, ...fields },
            MANAGER
        );
    }

    it("inserts a profile with its permission ID", async () => {
        const id = randomUUID();
        const permissionId = randomUUID();
        const profile = await repo.insert(id, permissionId, FIELDS, MANAGER);
        assert.equal(profile.id, id);
        assert.equal(profile.usePermissionId, permissionId);
        assert.equal(profile.revision, 1);
        assert.deepEqual(profile.allowedModels, ["model-a", "model-b"]);
        assert.equal(profile.allowedDailyTokens, 100000);
        assert.equal(profile.allowedWeeklyTokens, null);
        assert.equal(profile.allowedMonthlyTokens, Number.MAX_SAFE_INTEGER);
        assert.equal(profile.createdBy, MANAGER);
        assert.deepEqual(await repo.get(id), profile);
    });

    it("enforces the schema constraints", async () => {
        const id = randomUUID();
        await assert.rejects(
            pool.query(
                `INSERT INTO access_profiles (id, name, allowed_models) VALUES ($1, 'x', ARRAY['m'])`,
                [id]
            ),
            /null value.*use_permission_id/i,
            "a profile needs a permission ID"
        );
        for (const [sql, label] of [
            [
                `INSERT INTO access_profiles (id, name, allowed_models, use_permission_id, allowed_daily_tokens) VALUES ($1, 'x', ARRAY['m'], $2, -1)`,
                "limits can't be negative"
            ],
            [
                `INSERT INTO access_profiles (id, name, allowed_models, use_permission_id) VALUES ($1, ' ', ARRAY['m'], $2)`,
                "names can't be blank"
            ],
            [
                `INSERT INTO access_profiles (id, name, allowed_models, use_permission_id) VALUES ($1, 'x', ARRAY[]::text[], $2)`,
                "allowed models can't be empty"
            ]
        ]) {
            await assert.rejects(
                pool.query(sql, [id, randomUUID()]),
                /check/i,
                label
            );
        }
        const a = await insert();
        await assert.rejects(
            repo.insert(randomUUID(), a.usePermissionId, FIELDS, MANAGER),
            /unique/i,
            "a permission belongs to one profile"
        );
    });

    it("commits a transaction's work, and rolls it back when the work fails", async () => {
        const kept = randomUUID();
        await repo.transaction((tx) =>
            tx.insert(kept, randomUUID(), FIELDS, MANAGER)
        );
        assert.ok(await repo.get(kept));

        const dropped = randomUUID();
        await assert.rejects(
            repo.transaction(async (tx) => {
                await tx.insert(dropped, randomUUID(), FIELDS, MANAGER);
                // visible inside the transaction only
                assert.ok(await tx.get(dropped));
                assert.equal(await repo.get(dropped), null);
                throw new Error("the Auth API call failed");
            }),
            /Auth API call failed/
        );
        assert.equal(await repo.get(dropped), null);
    });

    it("deletes a row inside a transaction, restoring it on rollback (LIFE-4)", async () => {
        const profile = await insert();
        await assert.rejects(
            repo.transaction(async (tx) => {
                assert.equal((await tx.delete(profile.id))?.id, profile.id);
                throw new Error("the Auth API call failed");
            })
        );
        assert.deepEqual(await repo.get(profile.id), profile);

        const deleted = await repo.transaction((tx) => tx.delete(profile.id));
        assert.equal(deleted?.usePermissionId, profile.usePermissionId);
        assert.equal(await repo.get(profile.id), null);
        assert.equal(await repo.delete(profile.id), null);
        assert.equal(await repo.delete("not-a-uuid"), null);
    });

    it("updates with the expected revision only (DATA-4)", async () => {
        const profile = await insert();
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
        // the permission is never changed by an update
        assert.equal(updated.profile.usePermissionId, profile.usePermissionId);

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

    it("lists with search, paging, enabled and an injected condition over alias p", async () => {
        const { pool: listPool, drop: dropList } = await createTestDatabase(
            "profile_list"
        );
        try {
            const listRepo = new ProfileRepository(listPool);
            const names = ["Alpha", "beta", "Gamma 100%", "Delta"];
            const created: Record<string, string> = {};
            for (const name of names) {
                const p = await listRepo.insert(
                    randomUUID(),
                    randomUUID(),
                    { ...FIELDS, name, enabled: name !== "Delta" },
                    MANAGER
                );
                created[name] = p.id;
            }

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

            const enabled = await listRepo.list({ enabledOnly: true });
            assert.equal(enabled.total, 3);

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
