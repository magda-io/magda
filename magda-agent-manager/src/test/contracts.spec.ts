import { expect } from "chai";
import { claimName, USER_LABEL } from "../kubernetes.js";
import { upstreamHeaders } from "../runtimeProxy.js";

describe("Agent Manager contracts", () => {
    it("uses the accepted deterministic claim identity", () => {
        expect(claimName("00000000-0000-4000-8000-000000000123")).to.equal(
            "magda-agent-00000000-0000-4000-8000-000000000123"
        );
        expect(USER_LABEL).to.equal("agent.magda.io/user-id");
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
