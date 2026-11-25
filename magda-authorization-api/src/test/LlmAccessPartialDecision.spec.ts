import "mocha";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import express from "express";
import request from "supertest";
import { expect } from "chai";
import createOpaRouter from "../createOpaRouter.js";
import Database from "../Database.js";
import AuthDecision from "magda-typescript-common/src/opa/AuthDecision.js";
import SQLSyntax, { sqls } from "sql-syntax";
import getTestDBConfig from "./getTestDBConfig.js";

// #3838 EVAL-1 / TEST-2: an `llm/access/invoke` partial decision (profile
// unknown) translates, through the existing `AuthDecision.toSql`, into SQL over
// LLM Services' flat `access_profiles` columns, and that SQL selects exactly the
// profiles that full decisions allow. An unconditional `true` decision
// translates to an empty condition, so it must be wrapped (e.g. with
// `SQLSyntax.where(SQLSyntax.joinWithAnd([...]))`). Needs a real OPA loaded with
// `magda-opa/policies` at OPA_URL (CI starts one) and the test Postgres.
const opaUrl = process.env["OPA_URL"] || "http://localhost:8181/";

// LLM Services' invocation tests (TEST-2 at the service level) replay these
// recorded decisions against the same profile fixtures. The last test below
// checks the recording still matches what the policy returns; regenerate it
// with UPDATE_LLM_INVOKE_DECISIONS=1.
const RECORDED_DECISIONS_FILE = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../magda-llm-services/src/test/fixtures/llmInvokeDecisions.json"
);
const updateRecordedDecisions = !!process.env["UPDATE_LLM_INVOKE_DECISIONS"];

const FINANCE = "00000000-0000-4000-8000-00000000f000";
const CORPORATE = "00000000-0000-4000-8000-00000000c000";
const SALES = "00000000-0000-4000-8000-00000000e000";
const PROFILE_PERMISSION = "00000000-0000-4000-8000-0000000000aa";
const OTHER_PERMISSION = "00000000-0000-4000-8000-0000000000bb";

const PROFILES = [
    // id suffix, org unit, use permission, public
    ["01", FINANCE, PROFILE_PERMISSION, false],
    ["02", CORPORATE, OTHER_PERMISSION, false],
    ["03", SALES, "00000000-0000-4000-8000-0000000000c1", false],
    ["04", null, "00000000-0000-4000-8000-0000000000c2", true],
    ["05", null, "00000000-0000-4000-8000-0000000000c3", false]
].map(([suffix, orgUnit, permission, isPublic]) => ({
    id: `00000000-0000-4000-8000-0000000000${suffix}`,
    org_unit_id: orgUnit as string,
    use_permission_id: permission as string,
    constraint_exemption: isPublic as boolean
}));

function permission(flags: Record<string, any>) {
    return {
        id: "00000000-0000-4000-8000-0000000000ff",
        resourceUri: "llm/access",
        userOwnershipConstraint: false,
        orgUnitOwnershipConstraint: false,
        preAuthorisedConstraint: false,
        allowExemption: false,
        operations: [{ uri: "llm/access/invoke" }],
        ...flags
    };
}

const SCENARIOS: Record<string, any[]> = {
    unconstrained: [permission({})],
    "audience org unit (user in Finance)": [
        permission({ orgUnitOwnershipConstraint: true })
    ],
    "profile pre-authorised permission": [
        permission({ id: PROFILE_PERMISSION, preAuthorisedConstraint: true })
    ],
    "exemption-capable audience permission": [
        permission({ orgUnitOwnershipConstraint: true, allowExemption: true })
    ],
    "owner constrained": [permission({ userOwnershipConstraint: true })],
    "no permission": []
};

// The profiles each scenario selects (full decisions agree, above).
const EXPECTED_PROFILE_IDS: Record<string, string[]> = {
    unconstrained: PROFILES.map((p) => p.id),
    // Finance and its ancestor Corporate, not Sales or no org unit
    "audience org unit (user in Finance)": [PROFILES[0].id, PROFILES[1].id],
    "profile pre-authorised permission": [PROFILES[0].id],
    "exemption-capable audience permission": [
        PROFILES[0].id,
        PROFILES[1].id,
        PROFILES[3].id
    ],
    "owner constrained": [],
    "no permission": []
};

describe("llm/access/invoke partial decisions translate to SQL (integration, real OPA)", function (this: Mocha.Suite) {
    this.timeout(30000);
    const dbConfig = getTestDBConfig();
    const testDbName = `test_llm_partial_${Date.now()}_${Math.floor(
        Math.random() * 1e6
    )}`;
    let pool: pg.Pool;
    let currentUser: any;
    const recorded: Record<string, any> = {};

    before(async function () {
        try {
            const res = await fetch(new URL("health", opaUrl));
            if (!res.ok) throw new Error(`OPA health ${res.status}`);
        } catch (e) {
            console.warn(`Skipping: no OPA at ${opaUrl} (${e})`);
            this.skip();
        }
        const adminPool = new pg.Pool({ ...dbConfig });
        await adminPool.query(`CREATE DATABASE "${testDbName}"`);
        await adminPool.end();
        pool = new pg.Pool({ ...dbConfig, database: testDbName });
        await pool.query(`CREATE TABLE access_profiles (
            id UUID PRIMARY KEY,
            org_unit_id UUID,
            use_permission_id UUID,
            constraint_exemption BOOLEAN NOT NULL DEFAULT FALSE
        )`);
        for (const p of PROFILES) {
            await pool.query(
                `INSERT INTO access_profiles VALUES ($1, $2, $3, $4)`,
                [
                    p.id,
                    p.org_unit_id,
                    p.use_permission_id,
                    p.constraint_exemption
                ]
            );
        }
    });

    after(async () => {
        if (!pool) return;
        await pool.end();
        const adminPool = new pg.Pool({ ...dbConfig });
        try {
            await adminPool.query(`DROP DATABASE IF EXISTS "${testDbName}"`);
        } finally {
            await adminPool.end();
        }
    });

    function buildApp() {
        const database = ({
            getCurrentUserInfo: async () => currentUser
        } as unknown) as Database;
        const app = express();
        app.use(express.json());
        app.use(createOpaRouter({ jwtSecret: "secret", database, opaUrl }));
        return app;
    }

    async function partialDecision() {
        const res = await request(buildApp())
            .post("/decision/llm/access/invoke")
            .send({ unknowns: ["input.object.llmAccessProfile"] });
        expect(res.status).to.equal(200);
        recordedBody = res.body;
        return AuthDecision.fromJson(res.body);
    }
    let recordedBody: any;

    async function fullDecision(profile: any) {
        const res = await request(buildApp())
            .post("/decision/llm/access/invoke")
            .send({ input: { object: { llmAccessProfile: profile } } });
        expect(res.status).to.equal(200);
        return res.body.result === true;
    }

    for (const [name, permissions] of Object.entries(SCENARIOS)) {
        it(`selects the same profiles as full decisions: ${name}`, async () => {
            currentUser = {
                id: "00000000-0000-4000-8000-000000000123",
                roles: [],
                permissions,
                managingOrgUnitIds: [FINANCE],
                orgUnitAncestorIds: [FINANCE, CORPORATE]
            };
            const decision = await partialDecision();
            recorded[name] = recordedBody;
            const condition = decision.toSql({
                prefixes: ["input.object.llmAccessProfile"],
                tableRef: "p"
            });
            const query = sqls`SELECT p.id FROM access_profiles p ${SQLSyntax.where(
                SQLSyntax.joinWithAnd([condition])
            )} ORDER BY p.id`.toQuery();
            const selected = (await pool.query(...query)).rows.map((r) => r.id);

            const expected: string[] = [];
            for (const p of PROFILES) {
                if (await fullDecision(p)) expected.push(p.id);
            }
            expect(selected).to.deep.equal(expected.sort());
        });
    }

    it("selects the expected profiles for each grant type", async () => {
        for (const [name, permissions] of Object.entries(SCENARIOS)) {
            currentUser = {
                id: "00000000-0000-4000-8000-000000000123",
                roles: [],
                permissions,
                managingOrgUnitIds: [FINANCE],
                orgUnitAncestorIds: [FINANCE, CORPORATE]
            };
            const decision = await partialDecision();
            const condition = decision.toSql({
                prefixes: ["input.object.llmAccessProfile"],
                tableRef: "p"
            });
            const rows = (
                await pool.query(
                    ...sqls`SELECT p.id FROM access_profiles p ${SQLSyntax.where(
                        SQLSyntax.joinWithAnd([condition])
                    )} ORDER BY p.id`.toQuery()
                )
            ).rows.map((r) => r.id);
            expect(rows, name).to.deep.equal(EXPECTED_PROFILE_IDS[name]);
        }
    });

    it("gives administrators an unconditional decision", async () => {
        currentUser = {
            id: "00000000-0000-4000-8000-000000000123",
            roles: [{ id: "00000000-0000-0003-0000-000000000000" }],
            permissions: [],
            managingOrgUnitIds: [],
            orgUnitAncestorIds: []
        };
        const decision = await partialDecision();
        recorded["administrator"] = recordedBody;
        expect(decision.hasResidualRules).to.equal(false);
        expect(decision.result).to.equal(true);
    });

    it("matches the decisions recorded for LLM Services' invocation tests", () => {
        const fixture = {
            comment:
                "Recorded llm/access/invoke partial decisions (unknown input.object.llmAccessProfile) from magda-authorization-api/src/test/LlmAccessPartialDecision.spec.ts, for a user in org unit FINANCE (ancestor CORPORATE). Regenerate with UPDATE_LLM_INVOKE_DECISIONS=1.",
            orgUnits: { FINANCE, CORPORATE, SALES },
            profiles: PROFILES,
            expectedProfileIds: EXPECTED_PROFILE_IDS,
            decisions: recorded
        };
        if (updateRecordedDecisions) {
            fs.writeFileSync(
                RECORDED_DECISIONS_FILE,
                JSON.stringify(fixture, null, 4) + "\n"
            );
            return;
        }
        const stored = JSON.parse(
            fs.readFileSync(RECORDED_DECISIONS_FILE, "utf8")
        );
        expect(stored).to.deep.equal(fixture);
    });
});
