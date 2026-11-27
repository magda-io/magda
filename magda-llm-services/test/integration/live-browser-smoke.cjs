// Optional live-provider check. Requires Playwright installed by the operator.
// No response content, cookies, credentials or prompts are printed or saved.
// Only use a disposable/test account: this sends one billable model request.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");
let stage = "configuration";

(async () => {
    const base = process.env.MAGDA_E2E_URL;
    const email = process.env.MAGDA_E2E_EMAIL;
    const passwordFile = process.env.MAGDA_E2E_PASSWORD_FILE;
    assert(
        base && email && passwordFile,
        "Set MAGDA_E2E_URL, MAGDA_E2E_EMAIL and MAGDA_E2E_PASSWORD_FILE"
    );
    const browser = await chromium.launch({
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
            : {})
    });
    try {
        const context = await browser.newContext({
            ignoreHTTPSErrors: true,
            viewport: { width: 1400, height: 1000 }
        });
        const page = await context.newPage();
        stage = "login";
        await page.goto(`${base}/account`, { waitUntil: "domcontentloaded" });
        await page.fill("input[name=username]", email);
        await page.fill(
            "input[name=password]",
            fs.readFileSync(passwordFile, "utf8").trim()
        );
        await Promise.all([
            page.waitForURL((url) => !url.pathname.startsWith("/account")),
            page.click("input[type=submit]")
        ]);
        stage = "authenticated APIs / live route / ledger";
        const result = await page.evaluate(async () => {
            const get = async (route) => {
                const response = await fetch(`/api/v0/llm${route}`);
                if (
                    response.status !== 200 ||
                    response.headers.get("cache-control") !==
                        "private, no-store"
                )
                    throw new Error(
                        "Authenticated API or privacy header failed"
                    );
                return response.json();
            };
            const before = await get("/usage/me");
            const models = await get("/v1/models");
            const alias = models.data[0]?.id;
            if (!alias) throw new Error("Test account has no eligible model");
            const response = await fetch("/api/v0/llm/v1/responses", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: alias,
                    stream: true,
                    input: "Reply with one word.",
                    max_output_tokens: 64
                })
            });
            const status = response.status;
            const noStore =
                response.headers.get("cache-control") === "private, no-store";
            // Drain bytes without parsing, retaining or printing model content.
            const reader = response.body.getReader();
            let responseBytes = 0;
            while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                responseBytes += chunk.value.byteLength;
            }
            let after = await get("/usage/me");
            const deadline = Date.now() + 5000;
            while (
                after.totals.allTime.tokens <= before.totals.allTime.tokens &&
                Date.now() < deadline
            ) {
                await new Promise((resolve) => setTimeout(resolve, 100));
                after = await get("/usage/me");
            }
            return {
                status,
                noStore,
                responseBytes,
                alias,
                beforeTotal: before.totals.allTime.tokens,
                afterTotal: after.totals.allTime.tokens,
                measuredInputDelta:
                    after.totals.allTime.measuredInputTokens -
                    before.totals.allTime.measuredInputTokens,
                measuredOutputDelta:
                    after.totals.allTime.measuredOutputTokens -
                    before.totals.allTime.measuredOutputTokens,
                estimatedDelta:
                    after.totals.allTime.estimatedTokens -
                    before.totals.allTime.estimatedTokens
            };
        });
        assert.equal(result.status, 200, "Live Responses route");
        assert.equal(result.noStore, true);
        assert(result.responseBytes > 0);
        assert(
            result.afterTotal > result.beforeTotal,
            "Ledger increments after live request"
        );
        console.log(
            JSON.stringify({
                check: "live Responses via real Gateway + bundled LiteLLM",
                outcome: "PASS",
                ...result
            })
        );
        stage = "My Usage browser";
        await page.goto(`${base}/settings/llm-services/my-usage`, {
            waitUntil: "domcontentloaded"
        });
        await page
            .getByText("Daily history", { exact: false })
            .first()
            .waitFor();
        const text = await page.locator("body").innerText();
        assert(text.includes("Australia/Sydney"));
        if (process.env.MAGDA_E2E_SCREENSHOT) {
            // Hide identity/navigation, leaving only the usage report evidence.
            await page.addStyleTag({
                content:
                    "header, nav, footer, .header { visibility: hidden !important; }"
            });
            await page.screenshot({
                path: process.env.MAGDA_E2E_SCREENSHOT,
                fullPage: true
            });
        }
        console.log("PASS My Usage browser report and accounting timezone");
    } finally {
        await browser.close();
    }
})().catch(() => {
    // Don't echo provider bodies, credentials or Playwright page content.
    console.error(
        `FAIL live browser smoke at ${stage} (check account, route and local browser configuration)`
    );
    process.exitCode = 1;
});
