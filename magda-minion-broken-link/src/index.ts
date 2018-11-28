import minion from "@magda/minion-framework/dist/index";
import onRecordFound from "./onRecordFound";
import brokenLinkAspectDef from "./brokenLinkAspectDef";
import commonYargs from "@magda/minion-framework/dist/commonYargs";

const ID = "minion-broken-link";

const argv = commonYargs(ID, 6111, "http://localhost:6111", argv =>
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
            type: "object",
            default: {}
        })
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
                argv.domainWaitTimeConfigs
            )
    });
}

sleuthBrokenLinks().catch(e => {
    console.error("Error: " + e.message, e);
    process.exit(1);
});
