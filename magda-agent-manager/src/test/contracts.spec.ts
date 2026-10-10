import { expect } from "chai";
import {
    claimName,
    INSTALLATION_LABEL,
    shutdownTimeForActivity,
    USER_LABEL
} from "../kubernetes.js";
import {
    isMeaningfulRuntimeRequest,
    upstreamHeaders
} from "../runtimeProxy.js";

describe("Agent Manager contracts", () => {
    it("uses the accepted deterministic claim identity", () => {
        expect(
            claimName("00000000-0000-4000-8000-000000000123", "a1b2c3d4e5f6")
        ).to.equal(
            "magda-agent-a1b2c3d4e5f6-00000000-0000-4000-8000-000000000123"
        );
        expect(USER_LABEL).to.equal("agent.magda.io/user-id");
        expect(INSTALLATION_LABEL).to.equal("agent.magda.io/installation-id");
    });

    it("renews the hard-delete deadline from meaningful activity", () => {
        expect(
            shutdownTimeForActivity(
                new Date("2026-10-10T12:00:00.000Z"),
                8 * 60 * 60
            )
        ).to.equal("2026-10-10T20:00:00.000Z");
    });

    it("counts only explicit DSH user mutations as meaningful activity", () => {
        for (const path of [
            "/api/session/prompt",
            "/api/session/create",
            "/api/session/rename?source=user",
            "/api/terminal/write",
            "/api/subagents/prompt",
            "/api/$events/result"
        ]) {
            expect(isMeaningfulRuntimeRequest("POST", path)).to.equal(true);
        }
        for (const path of [
            "/api/session/list",
            "/api/session/follow",
            "/api/dynamicCordisRunner/inventory",
            "/api/schedule/catalog",
            "/api/remote.mux",
            "/status"
        ]) {
            expect(isMeaningfulRuntimeRequest("POST", path)).to.equal(false);
        }
        for (const method of ["GET", "HEAD", "OPTIONS", undefined]) {
            expect(
                isMeaningfulRuntimeRequest(method, "/api/session/prompt")
            ).to.equal(false);
        }
    });

    it("terminates browser and Magda credentials at the proxy boundary", () => {
        const headers = upstreamHeaders(
            {
                host: "agent-manager",
                origin: "https://magda.example",
                "sec-fetch-site": "same-origin",
                cookie: "connect.sid=browser; dsh=leak",
                authorization: "Bearer browser-secret",
                "proxy-authorization": "Basic secret",
                "x-magda-session": "jwt",
                "x-magda-api-key": "secret",
                "x-magda-api-key-id": "id",
                upgrade: "websocket",
                connection: "Upgrade"
            },
            "magda.example",
            "dsh-session=managed"
        );
        expect(headers.host).to.equal("magda.example");
        expect(headers.cookie).to.equal("dsh-session=managed");
        expect(headers.origin).to.equal("https://magda.example");
        expect(headers["sec-fetch-site"]).to.equal("same-origin");
        expect(headers.upgrade).to.equal("websocket");
        expect(headers.authorization).to.equal(undefined);
        expect(headers["proxy-authorization"]).to.equal(undefined);
        expect(headers["x-magda-session"]).to.equal(undefined);
        expect(headers["x-magda-api-key"]).to.equal(undefined);
        expect(headers["x-magda-api-key-id"]).to.equal(undefined);
    });
});
