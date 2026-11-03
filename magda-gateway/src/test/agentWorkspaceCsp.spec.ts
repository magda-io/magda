import {} from "mocha";
import express from "express";
import nock from "nock";
import supertest from "supertest";
import fse from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { expect } from "chai";
import buildApp from "../buildApp.js";
import { AuthPluginBasicConfig } from "../createAuthPluginRouter.js";

/**
 * #3846: the managed DSH runtime needs a relaxed `script-src`. The fixture is
 * the gateway-config ConfigMap that `magda-core` renders with
 * `global.agentWorkspace.enabled=true`; the Helm render test
 * (deploy/helm/magda-core/tests/agent-services-render.sh) fails if the
 * rendered ConfigMap and this fixture diverge.
 */
const fixture = fse.readJsonSync(
    path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "fixtures/agentWorkspaceGatewayConfig.json"
    )
);

const RUNTIME_MOUNT = "/api/v0/agent/runtime";
const DSH_SCRIPT_SRC = "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

const appOptions = {
    listenPort: 80,
    externalUrl: "http://127.0.0.1",
    dbHost: "localhost",
    dbPort: 5432,
    authDBHost: "localhost",
    authDBPort: 5432,
    proxyRoutesJson: {
        agent: fixture.agentRoute,
        registry: { to: "http://registry/v0", auth: true },
        llm: { to: "http://llm-services/v0", auth: true }
    },
    webProxyRoutesJson: {},
    cookieJson: {},
    helmetJson: fixture.helmet,
    helmetPerPathJson: fixture.helmetPerPath,
    cspJson: fixture.csp,
    corsJson: {},
    authorizationApi: "http://127.0.0.1",
    sessionSecret: "secret",
    jwtSecret: "othersecret",
    userId: "b1fddd6f-e230-4068-bd2c-1a21844f1598",
    web: "http://web",
    tenantUrl: "http://tenant",
    defaultCacheControl: "DEFAULT CACHE CONTROL",
    authPluginConfigJson: [] as AuthPluginBasicConfig[],
    registryQueryCacheStdTTL: 600,
    registryQueryCacheMaxKeys: 500
};

function createApp(
    helmetJson: Record<string, any>,
    helmetPerPathJson: Record<string, any>
) {
    return buildApp(express(), {
        ...appOptions,
        helmetJson,
        helmetPerPathJson
    });
}

// Helm < 3.18 drops null-valued chart defaults (e.g. the default helmet's
// `defaultSrc: null`); newer Helm keeps them. Exercise both rendered forms.
function dropNulls(value: any): any {
    if (Array.isArray(value)) return value.map(dropNulls);
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, item]) => item !== null)
                .map(([key, item]) => [key, dropNulls(item)])
        );
    }
    return value;
}

const HELMET_VARIANTS: [string, Record<string, any>][] = [
    ["null defaults kept", fixture.helmet],
    ["null defaults dropped", dropNulls(fixture.helmet)]
];

function directive(csp: string, name: string) {
    return csp
        .split(";")
        .map((item) => item.trim())
        .find((item) => item.split(" ")[0] === name);
}

for (const [variant, helmetJson] of HELMET_VARIANTS) {
    describe(`Agent Workspace scoped DSH CSP (#3846), helmet ${variant}`, () => {
        let app: express.Application;
        let baselineApp: express.Application;

        before(() => {
            nock.disableNetConnect();
            nock.enableNetConnect("127.0.0.1");
            app = createApp(helmetJson, fixture.helmetPerPath);
            // The same deployment without the DSH exception.
            const baselinePerPath = { ...fixture.helmetPerPath };
            delete baselinePerPath[RUNTIME_MOUNT];
            baselineApp = createApp(helmetJson, baselinePerPath);
        });

        beforeEach(() => {
            // Every upstream answers with HTML, so a response's policy comes from
            // the gateway's path matching, not from the upstream.
            for (const host of [
                "http://agent-manager",
                "http://registry",
                "http://llm-services",
                "http://web"
            ]) {
                nock(host)
                    .persist()
                    .get(/.*/)
                    .reply(200, (uri) => `<html>${host}${uri}</html>`, {
                        "Content-Type": "text/html"
                    });
            }
        });

        afterEach(() => {
            nock.cleanAll();
        });

        after(() => {
            nock.enableNetConnect();
        });

        it("renders exactly one relaxed path: the DSH runtime mount", () => {
            const relaxed = Object.entries(fixture.helmetPerPath)
                .filter(([, config]: [string, any]) =>
                    (
                        config?.contentSecurityPolicy?.directives?.scriptSrc ??
                        []
                    ).includes("'unsafe-inline'")
                )
                .map(([pathname]) => pathname)
                .filter((pathname) => pathname.startsWith("/api/"));
            expect(relaxed).to.deep.equal([RUNTIME_MOUNT]);
            expect(fixture.agentRoute.to).to.equal("http://agent-manager/v0");
        });

        for (const pathname of [
            `${RUNTIME_MOUNT}/`,
            `${RUNTIME_MOUNT}/index.html`,
            `${RUNTIME_MOUNT}/assets/index-abc123.js`,
            `${RUNTIME_MOUNT}/api/sessions?limit=20`
        ]) {
            it(`applies the DSH policy to the runtime mount: ${pathname}`, async () => {
                const res = await supertest(app).get(pathname).expect(200);
                const csp = res.headers["content-security-policy"];
                expect(directive(csp, "script-src")).to.equal(DSH_SCRIPT_SRC);
                expect(directive(csp, "frame-ancestors")).to.equal(
                    "frame-ancestors 'self'"
                );
                expect(directive(csp, "connect-src")).to.equal(
                    "connect-src 'self'"
                );
            });
        }

        for (const pathname of [
            "/",
            "/settings/agent-workspace",
            "/settings/agent-workspace/skills",
            "/api/v0/agent/session",
            "/api/v0/agent/skills/user",
            "/api/v0/registry/records",
            "/api/v0/llm/v1/models",
            // Near-match and sibling prefixes.
            "/api/v0/agent/runtime-evil/",
            "/api/v0/agent/runtimes/",
            "/api/v0/agent/runtime.js",
            "/api/v0/agent/runtimeX",
            "/api/v0/agentruntime/",
            "/api/v0/agent/x/runtime/",
            "/api/v1/agent/runtime/",
            "/agent/runtime/",
            "/runtime/",
            // Encoded separators and characters do not match the mount.
            "/api/v0/agent/runtime%2F",
            "/api/v0/agent/%72untime/",
            "/api/v0/agent%2Fruntime/"
        ]) {
            it(`keeps the existing strict policy for ${pathname}`, async () => {
                const [res, baselineRes] = await Promise.all([
                    supertest(app).get(pathname),
                    supertest(baselineApp).get(pathname)
                ]);
                const csp = res.headers["content-security-policy"];
                expect(csp).to.be.a("string");
                expect(directive(csp, "script-src")).to.equal(
                    "script-src 'self'"
                );
                // Script directives stay strict (style-src may carry Helmet's own
                // default 'unsafe-inline' when Helm drops the null chart defaults).
                for (const name of [
                    "script-src",
                    "script-src-attr",
                    "script-src-elem"
                ]) {
                    expect(directive(csp, name) || "").to.not.match(
                        /'unsafe-(inline|eval)'/
                    );
                }
                expect(csp).to.equal(
                    baselineRes.headers["content-security-policy"]
                );
            });
        }

        // Express path matching is case-insensitive for both the helmet mount and
        // the proxy routes, so a case variant reaches the same Agent Manager
        // runtime mount. The relaxed policy must never cover Magda web content.
        for (const pathname of [
            "/API/V0/AGENT/RUNTIME/",
            "/api/v0/Agent/Runtime/assets/x.js"
        ]) {
            it(`only relaxes a case variant routed to the runtime: ${pathname}`, async () => {
                const res = await supertest(app).get(pathname).expect(200);
                const csp = res.headers["content-security-policy"];
                expect(res.text).to.match(
                    /^<html>http:\/\/agent-manager\/v0\//i
                );
                expect(directive(csp, "script-src")).to.equal(DSH_SCRIPT_SRC);
            });
        }
    });
}
