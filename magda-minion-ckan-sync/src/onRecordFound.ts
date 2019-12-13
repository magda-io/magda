import _ from "lodash";

import { Record } from "magda-typescript-common/src/generated/registry/api";
//import unionToThrowable from "magda-typescript-common/src/util/unionToThrowable";
import AuthorizedRegistryClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
//import ckanSyncAspectDef from "./ckanSyncAspectDef";

export default async function onRecordFound(
    record: Record,
    registry: AuthorizedRegistryClient
) {
    const tenantId = record.tenantId;
    console.log("tenantId: ", tenantId);
    const recordData = await registry.getRecord(
        record.id,
        ["dcat-dataset-strings"],
        [
            "ckan-sync",
            "dataset-distributions",
            "temporal-coverage",
            "dataset-publisher",
            "provenance"
        ],
        true
    );

    console.log("record: ", JSON.stringify(record));
    console.log("recordData: ", JSON.stringify(recordData));

    const ckanSyncData = record.aspects["dataset-distributions"];
    if (!ckanSyncData) {
        console.log(
            "The dataset record has no ckan-sync aspect. Ignore webhook request."
        );
        return;
    }
}
