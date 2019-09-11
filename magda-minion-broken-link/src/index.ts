import minion from "@magda/minion-framework/dist/index";
import onRecordFound from "./onRecordFound";
import brokenLinkAspectDef from "./brokenLinkAspectDef";
import commonYargs from "@magda/minion-framework/dist/commonYargs";
import { CoreOptions } from "request";
import coerceJson from "@magda/typescript-common/dist/coerceJson";

const ID = "minion-broken-link";

const argv = commonYargs(6111, "http://localhost:6111", argv =>
    argv
        .option("externalRetries", {
            describe:
                "Number of times to retry external links when checking whether they're broken",
            type: "number",
            default: 1
        })
        .option("domainWaitTimeConfig", {
            describe:
                "A object that defines wait time for each of domain. " +
                "Echo property name of the object would be the domain name and property value is the wait time in seconds",
            coerce: coerceJson("domainWaitTimeConfig"),
            default: process.env.DOMAIN_WAIT_TIME_CONFIG || JSON.stringify({})
        })
        .option("requestOpts", {
            describe:
                "The default options to use for the JS request library when making HTTP HEAD/GET requests",
            type: "string",
            coerce: coerceJson("requestOpts"),
            default:
                process.env.REQUEST_OPTS || JSON.stringify({ timeout: 20000 })
        })
);

console.log(
    "domainWaitTimeConfig: ",
    JSON.stringify(argv.domainWaitTimeConfig as any, null, 2)
);

function sleuthBrokenLinks() {
    return minion({
        argv,
        id: ID,
        aspects: ["dataset-distributions"],
        optionalAspects: [],
        async: true,
        writeAspectDefs: [brokenLinkAspectDef],
        onRecordFound: (record, registry) =>
            onRecordFound(
                record,
                registry,
                argv.externalRetries,
                1,
                argv.domainWaitTimeConfig as any,
                argv.requestOpts as CoreOptions
            )
    });
}

sleuthBrokenLinks().catch(e => {
    console.error("Error: " + e.message, e);
    process.exit(1);
});
