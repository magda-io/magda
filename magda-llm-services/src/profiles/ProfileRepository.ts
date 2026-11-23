import { randomUUID } from "node:crypto";
import pg from "pg";
import SQLSyntax, { sqls } from "sql-syntax";
import { AccessProfile, ProfileFields, ProfileState } from "./types.js";
import { isUuid } from "./validation.js";

/**
 * The table alias used by every profile query. An authorisation condition
 * passed to `list` (EVAL-1: a translated partial decision,
 * `AuthDecision.toSql({ prefixes: ["input.object.llmAccessProfile"], tableRef: PROFILE_TABLE_ALIAS })`)
 * must reference this alias.
 */
export const PROFILE_TABLE_ALIAS = "p";

const COLUMNS = sqls`p.id, p.name, p.description, p.allowed_models, p.enabled, p.state,
    p.org_unit_id, p.constraint_exemption, p.use_permission_id,
    p.allowed_daily_tokens, p.allowed_weekly_tokens, p.allowed_monthly_tokens,
    p.revision, p.created_by, p.updated_by, p.created_at, p.updated_at`;

function toNumberOrNull(value: unknown): number | null {
    if (value === null || value === undefined) {
        return null;
    }
    // node-postgres returns BIGINT as a string
    const n = Number(value);
    if (!Number.isSafeInteger(n)) {
        throw new Error(`Database value ${value} is not a safe integer`);
    }
    return n;
}

export function rowToProfile(row: any): AccessProfile {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        allowedModels: row.allowed_models,
        enabled: row.enabled,
        state: row.state,
        orgUnitId: row.org_unit_id,
        constraintExemption: row.constraint_exemption,
        usePermissionId: row.use_permission_id,
        allowedDailyTokens: toNumberOrNull(row.allowed_daily_tokens),
        allowedWeeklyTokens: toNumberOrNull(row.allowed_weekly_tokens),
        allowedMonthlyTokens: toNumberOrNull(row.allowed_monthly_tokens),
        revision: toNumberOrNull(row.revision) as number,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

export interface ListProfilesOptions {
    /** Case-insensitive substring of the profile name. */
    search?: string;
    states?: ProfileState[];
    /** Only enabled profiles. */
    enabledOnly?: boolean;
    /**
     * An extra SQL condition over table alias `p`, e.g. a translated
     * authorisation residual (EVAL-1). An empty condition means no restriction.
     */
    condition?: SQLSyntax;
    offset?: number;
    limit?: number;
}

export type UpdateResult =
    | { status: "updated"; profile: AccessProfile }
    | { status: "stale"; profile: AccessProfile }
    | { status: "not_found" };

/**
 * SQL access to `access_profiles` (#3838). It stores profile rows only: the
 * Authorization API objects the rows refer to are created and checked by the
 * profile API (#3940). Never touches Authorization DB tables (DATA-5).
 */
export default class ProfileRepository {
    constructor(private readonly pool: pg.Pool) {}

    /** LIFE-1 step 1: insert a profile as `pending`. */
    async createPending(
        fields: ProfileFields,
        createdBy: string | null,
        id: string = randomUUID()
    ): Promise<AccessProfile> {
        const result = await this.pool.query(
            ...sqls`INSERT INTO access_profiles AS p
                (id, name, description, allowed_models, enabled, state,
                 org_unit_id, constraint_exemption,
                 allowed_daily_tokens, allowed_weekly_tokens, allowed_monthly_tokens,
                 created_by, updated_by)
            VALUES (${id}, ${fields.name}, ${fields.description},
                ${fields.allowedModels}, ${fields.enabled}, 'pending',
                ${fields.orgUnitId}, ${fields.constraintExemption},
                ${fields.allowedDailyTokens}, ${fields.allowedWeeklyTokens},
                ${fields.allowedMonthlyTokens}, ${createdBy}, ${createdBy})
            RETURNING ${COLUMNS}`.toQuery()
        );
        return rowToProfile(result.rows[0]);
    }

    /**
     * LIFE-1 step 3: store the profile's permission and mark it `ready`.
     * Returns `null` unless the profile is still `pending`.
     */
    async markReady(
        id: string,
        usePermissionId: string
    ): Promise<AccessProfile | null> {
        const result = await this.pool.query(
            ...sqls`UPDATE access_profiles AS p
                SET state = 'ready', use_permission_id = ${usePermissionId},
                    revision = p.revision + 1, updated_at = now()
                WHERE p.id = ${id} AND p.state = 'pending'
                RETURNING ${COLUMNS}`.toQuery()
        );
        return result.rows.length ? rowToProfile(result.rows[0]) : null;
    }

    async get(id: string): Promise<AccessProfile | null> {
        if (!isUuid(id)) {
            return null;
        }
        const result = await this.pool.query(
            ...sqls`SELECT ${COLUMNS} FROM access_profiles p WHERE p.id = ${id}`.toQuery()
        );
        return result.rows.length ? rowToProfile(result.rows[0]) : null;
    }

    private listConditions(options: ListProfilesOptions): SQLSyntax {
        const conditions: SQLSyntax[] = [];
        if (options.search?.trim()) {
            const pattern = `%${options.search
                .trim()
                .replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
            conditions.push(sqls`p.name ILIKE ${pattern}`);
        }
        if (options.states?.length) {
            conditions.push(sqls`p.state = ANY(${options.states})`);
        }
        if (options.enabledOnly) {
            conditions.push(sqls`p.enabled = TRUE`);
        }
        if (options.condition && !options.condition.isEmpty) {
            conditions.push(sqls`(${options.condition})`);
        }
        return SQLSyntax.where(SQLSyntax.joinWithAnd(conditions));
    }

    async list(
        options: ListProfilesOptions = {}
    ): Promise<{ items: AccessProfile[]; total: number }> {
        const offset = Math.max(0, options.offset ?? 0);
        const limit = Math.min(Math.max(1, options.limit ?? 100), 500);
        const where = this.listConditions(options);
        const [items, count] = await Promise.all([
            this.pool.query(
                ...sqls`SELECT ${COLUMNS} FROM access_profiles p ${where}
                    ORDER BY lower(p.name), p.id
                    OFFSET ${offset} LIMIT ${limit}`.toQuery()
            ),
            this.pool.query(
                ...sqls`SELECT count(*)::int AS total FROM access_profiles p ${where}`.toQuery()
            )
        ]);
        return {
            items: items.rows.map(rowToProfile),
            total: count.rows[0].total
        };
    }

    /**
     * LIFE-2 / DATA-4: update the manager-settable fields when the stored
     * revision equals `expectedRevision`, bumping the revision.
     * Only `ready` profiles can be updated.
     */
    async update(
        id: string,
        expectedRevision: number,
        fields: ProfileFields,
        updatedBy: string | null
    ): Promise<UpdateResult> {
        const result = await this.pool.query(
            ...sqls`UPDATE access_profiles AS p SET
                    name = ${fields.name},
                    description = ${fields.description},
                    allowed_models = ${fields.allowedModels},
                    enabled = ${fields.enabled},
                    org_unit_id = ${fields.orgUnitId},
                    constraint_exemption = ${fields.constraintExemption},
                    allowed_daily_tokens = ${fields.allowedDailyTokens},
                    allowed_weekly_tokens = ${fields.allowedWeeklyTokens},
                    allowed_monthly_tokens = ${fields.allowedMonthlyTokens},
                    updated_by = ${updatedBy},
                    revision = p.revision + 1,
                    updated_at = now()
                WHERE p.id = ${id} AND p.revision = ${expectedRevision}
                    AND p.state = 'ready'
                RETURNING ${COLUMNS}`.toQuery()
        );
        if (result.rows.length) {
            return { status: "updated", profile: rowToProfile(result.rows[0]) };
        }
        const current = await this.get(id);
        return current
            ? { status: "stale", profile: current }
            : { status: "not_found" };
    }

    /**
     * LIFE-4 step 1: stop the profile matching at once. Returns `null` when the
     * profile doesn't exist.
     */
    async markDeleting(id: string): Promise<AccessProfile | null> {
        const result = await this.pool.query(
            ...sqls`UPDATE access_profiles AS p
                SET state = 'deleting', enabled = FALSE,
                    revision = p.revision + 1, updated_at = now()
                WHERE p.id = ${id}
                RETURNING ${COLUMNS}`.toQuery()
        );
        return result.rows.length ? rowToProfile(result.rows[0]) : null;
    }

    /**
     * LIFE-4 step 3 (or abandoning a pending profile, LIFE-5): delete the row.
     * A `ready` profile is never deleted directly: mark it deleting first.
     */
    async delete(id: string): Promise<boolean> {
        const result = await this.pool.query(
            ...sqls`DELETE FROM access_profiles p
                WHERE p.id = ${id} AND p.state IN ('deleting', 'pending')`.toQuery()
        );
        return (result.rowCount ?? 0) > 0;
    }

    /**
     * LIFE-5 repair: replace a missing permission of a `ready` profile, when the
     * stored one is still `previousPermissionId`.
     */
    async replacePermission(
        id: string,
        previousPermissionId: string,
        usePermissionId: string
    ): Promise<AccessProfile | null> {
        const result = await this.pool.query(
            ...sqls`UPDATE access_profiles AS p
                SET use_permission_id = ${usePermissionId},
                    revision = p.revision + 1, updated_at = now()
                WHERE p.id = ${id} AND p.state = 'ready'
                    AND p.use_permission_id = ${previousPermissionId}
                RETURNING ${COLUMNS}`.toQuery()
        );
        return result.rows.length ? rowToProfile(result.rows[0]) : null;
    }

    /** LIFE-5: profiles in the given states, oldest first. */
    async listByState(
        states: ProfileState[],
        limit: number = 100
    ): Promise<AccessProfile[]> {
        const result = await this.pool.query(
            ...sqls`SELECT ${COLUMNS} FROM access_profiles p
                WHERE p.state = ANY(${states})
                ORDER BY p.updated_at, p.id LIMIT ${limit}`.toQuery()
        );
        return result.rows.map(rowToProfile);
    }
}
