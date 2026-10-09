// #3841 Experiment 4C/5: DSH process restart and Sandbox suspend/resume while
// a real browser holds the DSH UI open through the full Minikube chain.
// Usage: node lifecycle-browser.mjs <alice|bob> [--out file]
import { execSync } from "node:child_process";
import fs from "node:fs";
import { dismissPreviewNotice, launch, loggedInContext, recordMux, MOUNT, sleep } from "./lib/browser.mjs";
import { USERS } from "./lib/magda.mjs";

const user = process.argv[2] || "alice";
const outIdx = process.argv.indexOf("--out");
const NS = "magda-agent-poc";
const kubectl = (a) => execSync(`kubectl ${a}`, { encoding: "utf8" }).trim();
const report = { user, checks: [] };
function check(name, ok, detail = {}) {
    report.checks.push({ name, ok: !!ok, ...detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name} ${JSON.stringify(detail)}`);
}
const waitFor = async (fn, timeoutMs, stepMs = 250) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
        if (await fn()) return true;
        await sleep(stepMs);
    }
    return false;
};
const claim = JSON.parse(kubectl(`-n ${NS} get sandboxclaim -l magda.io/agent-user=${USERS[user].id} -o json`)).items[0];
const sandbox = claim.status.sandbox.name;
report.sandbox = sandbox;
report.agentManagerAuthMode = kubectl(`-n ${NS} get deploy agent-manager -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="AUTH_MODE")].value}'`);
const cookieExchanges = () => kubectl(`-n ${NS} logs deploy/agent-manager`).split("\n").filter((l) => l.includes("dsh-cookie-acquired")).length;
// Fingerprint of the current launch token (hand-off file; the log is redacted).
const launchToken = () => {
    try {
        return kubectl(`-n ${NS} exec ${sandbox} -c agent -- sh -c 'sha256sum /run/magda-agent/dsh-launch-token 2>/dev/null | cut -c1-12'`);
    } catch {
        return "";
    }
};

const browser = await launch();
const ctx = await loggedInContext(browser, `${user}@magda.test`);
const page = await ctx.newPage();
const mux = recordMux(page);
await page.goto(MOUNT);
await page.getByRole("button", { name: "Continue" }).click({ timeout: 8000 }).catch(() => {});
await waitFor(() => mux.opened.size >= 3, 20000);

async function promptRoundTrip(tag) {
    await dismissPreviewNotice(page);
    await page.getByRole("button", { name: "New session" }).first().click();
    // the new-session draft view must replace the current session before typing
    await page.getByText("Into the Unknown").waitFor({ timeout: 15000 });
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.click();
    await page.keyboard.type(`STREAM 3 ${tag}`);
    await page.keyboard.press("Enter");
    return page.getByText(`stream complete ${tag}`).first().waitFor({ timeout: 60000 }).then(() => true, () => false);
}
// Session state is checked on the PVC (the sidebar only lists the latest few).
const sessionsOnDisk = () => {
    try {
        return Number(kubectl(`-n ${NS} exec ${sandbox} -c agent -- sh -c 'find "$DSH_HOME/sessions" -mindepth 2 -maxdepth 2 -name "session-*" | wc -l'`));
    } catch {
        return -1;
    }
};

check("baseline prompt round trip", await promptRoundTrip(`base-${Date.now()}`));

async function disruption(name, act) {
    const live = mux.sockets.at(-1);
    const exchanges = cookieExchanges();
    const sessionsBefore = sessionsOnDisk();
    const t = Date.now();
    const detail = await act();
    const dropped = await waitFor(() => live.closedAt !== undefined, 180000, 250);
    const reopened = await waitFor(() => {
        const s = mux.sockets.at(-1);
        // a socket that stays up: the client's backoff retries also connect
        // briefly while DSH is still booting and are closed again
        return s !== live && !s.closedAt && s.openedAt > t && Date.now() - s.openedAt > 2000;
    }, 240000, 250);
    const reconnectedAt = reopened ? mux.sockets.at(-1).openedAt : undefined;
    const sessionsAfter = sessionsOnDisk();
    await sleep(3000); // let the UI resync its projections after the new socket
    let works = await promptRoundTrip(`after-${Date.now()}`);
    let promptRetried = false;
    if (!works) {
        await page.screenshot({ path: `/tmp/lifecycle-first-prompt-${Date.now()}.png` });
        promptRetried = true;
        works = await promptRoundTrip(`retry-${Date.now()}`);
    }
    check(`${name}: browser reconnects and the agent works again`, dropped && reopened && works, {
        ...detail,
        socketDroppedAfterMs: dropped ? live.closedAt - t : undefined,
        reconnectedAfterMs: reconnectedAt ? reconnectedAt - t : undefined,
        transientSockets: mux.sockets.filter((x) => x.openedAt > t && x.closedAt).length,
        sessionFilesBefore: sessionsBefore,
        sessionFilesAfter: sessionsAfter,
        promptRetried,
        dshCookieReExchanges: cookieExchanges() - exchanges
    });
}

await disruption("DSH process restart (same Pod, same PVC)", async () => {
    const before = launchToken();
    const restarts = kubectl(`-n ${NS} get pod ${sandbox} -o jsonpath='{.status.containerStatuses[0].restartCount}'`);
    kubectl(`-n ${NS} exec ${sandbox} -c agent -- kill -TERM 1`);
    await waitFor(() => kubectl(`-n ${NS} get pod ${sandbox} -o jsonpath='{.status.containerStatuses[0].restartCount}'`) !== restarts, 60000, 1000);
    await waitFor(() => launchToken() && launchToken() !== before, 60000, 1000);
    return { launchTokenChanged: launchToken() !== before };
});

await disruption("Sandbox suspend + resume (Pod deleted, PVC kept)", async () => {
    const podUid = kubectl(`-n ${NS} get pod ${sandbox} -o jsonpath='{.metadata.uid}'`);
    kubectl(`-n ${NS} patch sandbox ${sandbox} --type=merge -p '{"spec":{"operatingMode":"Suspended"}}'`);
    const podGone = await waitFor(() => {
        try {
            return kubectl(`-n ${NS} get pod ${sandbox} -o jsonpath='{.metadata.uid}'`) !== podUid;
        } catch {
            return true;
        }
    }, 120000, 1000);
    const suspendedAt = Date.now();
    await sleep(10000); // browser sees the outage
    kubectl(`-n ${NS} patch sandbox ${sandbox} --type=merge -p '{"spec":{"operatingMode":"Running"}}'`);
    await waitFor(() => {
        try {
            return kubectl(`-n ${NS} get pod ${sandbox} -o jsonpath='{.status.containerStatuses[0].ready}'`) === "true";
        } catch {
            return false;
        }
    }, 180000, 1000);
    return {
        podDeleted: podGone,
        suspendedSeconds: Math.round((Date.now() - suspendedAt) / 1000),
        newPodUid: kubectl(`-n ${NS} get pod ${sandbox} -o jsonpath='{.metadata.uid}'`) !== podUid,
        pvcCreatedAt: kubectl(`-n ${NS} exec ${sandbox} -c agent -- cat /data/.created-at`)
    };
});

await browser.close();
if (outIdx > 0) fs.writeFileSync(process.argv[outIdx + 1], JSON.stringify(report, null, 2));
const failed = report.checks.filter((c) => !c.ok).length;
console.log(`${report.checks.length - failed}/${report.checks.length} checks passed`);
process.exit(failed ? 1 : 0);
