import _ from "lodash";

import { Record } from "magda-typescript-common/src/generated/registry/api";
//import unionToThrowable from "magda-typescript-common/src/util/unionToThrowable";
import AuthorizedRegistryClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
import CkanClient from "magda-typescript-common/src/CkanClient";
import ckanSyncAspectDef from "./ckanSyncAspectDef";

export interface CkanSyncAspectType {
    status: "retain" | "withdraw";
    syncUserId?: string;
    ckanId?: string;
    hasCreated: boolean;
    syncRequired: boolean;
    syncAttempted: boolean;
    lastSyncAttemptTime?: string;
    syncError?: string;
}

async function recordSuccessCkanSyncAction(
    recordId: string,
    tenantId: number,
    registry: AuthorizedRegistryClient,
    ckanSyncData: CkanSyncAspectType,
    ckanId?: string
) {
    const data: CkanSyncAspectType = {
        ...ckanSyncData,
        syncRequired: false,
        syncAttempted: true,
        lastSyncAttemptTime: new Date().toISOString()
    };
    if (ckanId) {
        data.ckanId = ckanId;
        data.hasCreated = true;
    } else {
        data.ckanId = undefined;
        data.hasCreated = false;
    }
    const res = await registry.putRecordAspect(
        recordId,
        ckanSyncAspectDef.id,
        data,
        tenantId
    );
    if (res instanceof Error) {
        throw Error;
    }
}

async function recordFailCkanSyncAction(
    recordId: string,
    tenantId: number,
    registry: AuthorizedRegistryClient,
    ckanSyncData: CkanSyncAspectType,
    error: Error | string
) {
    const data: CkanSyncAspectType = {
        ...ckanSyncData,
        syncAttempted: true,
        lastSyncAttemptTime: new Date().toISOString(),
        syncError: `${error}`
    };
    const res = await registry.putRecordAspect(
        recordId,
        ckanSyncAspectDef.id,
        data,
        tenantId
    );
    if (res instanceof Error) {
        throw Error;
    }
}

async function createCkanPackage(ckanClient: CkanClient, record: Record) {}

async function updateCkanPackage(
    ckanClient: CkanClient,
    ckanId: string,
    record: Record
) {}

export default async function onRecordFound(
    ckanClient: CkanClient,
    record: Record,
    registry: AuthorizedRegistryClient
) {
    try {
        const tenantId = record.tenantId;
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

        if (recordData instanceof Error) {
            throw recordData;
        }

        const ckanSyncData = record.aspects["ckan-sync"] as CkanSyncAspectType;
        if (!ckanSyncData) {
            console.log(
                "The dataset record has no ckan-sync aspect. Ignore webhook request."
            );
            return;
        }

        if (!ckanSyncData.syncRequired) {
            console.log(
                `Ignore as no sync is required for dataset ${recordData.id}: `,
                ckanSyncData
            );
            return;
        }

        if (ckanSyncData.status === "withdraw") {
            if (!ckanSyncData.hasCreated || !ckanSyncData.ckanId) {
                return;
            }
            const pkgData = await ckanClient.getPackage(ckanSyncData.ckanId);
            if (pkgData) {
                try {
                    await ckanClient.callCkanFunc("package_delete", {
                        id: ckanSyncData.ckanId
                    });
                } catch (e) {
                    await recordFailCkanSyncAction(
                        recordData.id,
                        tenantId,
                        registry,
                        ckanSyncData,
                        e
                    );
                }
            } else {
                await recordSuccessCkanSyncAction(
                    recordData.id,
                    tenantId,
                    registry,
                    ckanSyncData
                );
            }
        } else if (ckanSyncData.status === "retain") {
            let ckanId: string;
            let error: Error;
            try {
                if (ckanSyncData.hasCreated && ckanSyncData.ckanId) {
                    const pkgData = await ckanClient.getPackage(
                        ckanSyncData.ckanId
                    );
                    if (pkgData) {
                        ckanId = ckanSyncData.ckanId;
                        await updateCkanPackage(ckanClient, ckanId, recordData);
                    } else {
                        ckanId = await createCkanPackage(
                            ckanClient,
                            recordData
                        );
                    }
                } else {
                    ckanId = await createCkanPackage(ckanClient, recordData);
                }
            } catch (e) {
                error = e;
            }

            if (error) {
                await recordFailCkanSyncAction(
                    recordData.id,
                    tenantId,
                    registry,
                    ckanSyncData,
                    error
                );
            } else {
                await recordSuccessCkanSyncAction(
                    recordData.id,
                    tenantId,
                    registry,
                    ckanSyncData,
                    ckanId
                );
            }
        } else {
            throw new Error(`Unknow ckan sync status: ${ckanSyncData.status}`);
        }
    } catch (e) {
        console.error(
            `Error when process event for record ${
                record.id
            }: ${e} \n Record Data: ${JSON.stringify(record)}`
        );
    }
}
