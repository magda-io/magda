import _ from "lodash";
import { Record } from "magda-typescript-common/src/generated/registry/api";
import AuthorizedRegistryClient from "magda-typescript-common/src/registry/AuthorizedRegistryClient";
import CkanClient from "magda-typescript-common/src/CkanClient";
import ckanSyncAspectDef from "./ckanSyncAspectDef";
import URI from "urijs";

interface PlainObjectType {
    [key: string]: any;
}

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

async function createDistributionData(
    ckanClient: CkanClient,
    externalUrl: string,
    record: Record,
    distribution: Record
) {
    const url =
        distribution?.["aspects"]?.["dcat-distribution-strings"]?.[
            "downloadURL"
        ] ??
        distribution?.["aspects"]?.["dcat-distribution-strings"]?.[
            "accessURL"
        ] ??
        new URI(externalUrl).path(`dataset/${record.id}/details`).toString();
    const data = {
        name: record.name,
        url
    } as any;

    if (
        distribution?.["aspects"]?.["dcat-distribution-strings"]?.[
            "description"
        ]
    ) {
        data.description =
            distribution?.["aspects"]?.["dcat-distribution-strings"]?.[
                "description"
            ];
    }

    const format =
        distribution?.["aspects"]?.["dataset-format"]?.["format"] ??
        distribution?.["aspects"]?.["dcat-distribution-strings"]?.["format"] ??
        "";

    if (format) {
        data.description = format;
    }

    if (
        distribution?.["aspects"]?.["dcat-distribution-strings"]?.["mediaType"]
    ) {
        data.mimetype =
            distribution?.["aspects"]?.["dcat-distribution-strings"]?.[
                "mediaType"
            ];
    }

    if (distribution?.["aspects"]?.["dcat-distribution-strings"]?.["issued"]) {
        data.created =
            distribution?.["aspects"]?.["dcat-distribution-strings"]?.[
                "issued"
            ];
    }

    if (
        distribution?.["aspects"]?.["dcat-distribution-strings"]?.[
            "last_modified"
        ]
    ) {
        data.last_modified =
            distribution?.["aspects"]?.["dcat-distribution-strings"]?.[
                "last_modified"
            ];
    }

    return data;
}

async function createCkanDistributionsFromDataset(
    ckanClient: CkanClient,
    externalUrl: string,
    record: Record
): Promise<PlainObjectType[]> {
    // --- creating resources
    // --- to do: sync resource by id
    if (record?.aspects?.["dataset-distributions"]?.["distributions"].length) {
        const distributions = record?.aspects?.["dataset-distributions"]?.[
            "distributions"
        ] as Record[];
        return await Promise.all(
            distributions.map(item =>
                createDistributionData(ckanClient, externalUrl, record, item)
            )
        );
    } else {
        return [] as PlainObjectType[];
    }
}

async function createCkanPackageDataFromDataset(
    ckanClient: CkanClient,
    externalUrl: string,
    record: Record
) {
    const data = {
        name: await ckanClient.getAvailablePackageName(record.name),
        title: record.name
    } as any;

    if (record?.aspects?.publishing?.state === "draft") {
        data.private = true;
    } else {
        data.private = false;
    }

    const licenseStr =
        record?.aspects?.["dcat-dataset-strings"]?.["defaultLicense"] ??
        record?.aspects?.["dcat-dataset-strings"]?.["license"];

    if (licenseStr) {
        const license = await ckanClient.searchLicense(licenseStr);
        if (license) {
            data.license_id = license.id;
        }
    } else if (
        record?.aspects?.["dataset-distributions"]?.["distributions"].length
    ) {
        let disLicenseList: Record[] =
            record?.aspects?.["dataset-distributions"]?.["distributions"] ?? [];
        if (disLicenseList.length) {
            const disLicenseStrList: string[] = disLicenseList
                .map(
                    item =>
                        item?.aspects?.["dcat-distribution-strings"]?.license
                )
                .filter(item => !!item);
            if (disLicenseList.length) {
                for (let i = 0; i < disLicenseStrList.length; i++) {
                    const license = await ckanClient.searchLicense(
                        disLicenseStrList[i]
                    );
                    if (license) {
                        data.license_id = license.id;
                        break;
                    }
                }
            }
        }
    }

    if (record?.aspects?.["dcat-dataset-strings"]?.["description"]) {
        data.notes = record?.aspects?.["dcat-dataset-strings"]?.["description"];
    }

    data.url = new URI(externalUrl)
        .path(`dataset/${record.id}/details`)
        .toString();

    if (record?.aspects?.["dcat-dataset-strings"]?.["keywords"]) {
        const tagsData =
            record?.aspects?.["dcat-dataset-strings"]?.["keywords"];
        if (typeof tagsData === "string") {
            data.tags = [{ name: tagsData }];
        } else if (tagsData.length) {
            data.tags = (tagsData as string[]).map(name => ({ name }));
        }
    }

    if (record?.aspects?.["dataset-publisher"]?.["publisher"]?.["name"]) {
        const org = await ckanClient.searchAuthorizedOrgByName(
            record?.aspects?.["dataset-publisher"]?.["publisher"]?.["name"],
            "create_dataset"
        );

        if (org) {
            data.owner_org = org.id;
        }
    }

    return data;
}

async function createCkanPackage(
    ckanClient: CkanClient,
    record: Record,
    externalUrl: string
): Promise<string> {
    const data = await createCkanPackageDataFromDataset(
        ckanClient,
        externalUrl,
        record
    );

    const distributions = await await createCkanDistributionsFromDataset(
        ckanClient,
        externalUrl,
        record
    );

    if (distributions.length) {
        data.resources = distributions;
    }

    const pkg = await ckanClient.callCkanFunc<PlainObjectType>(
        "package_create",
        data
    );
    const pkgId = pkg.id as string;

    return pkgId;
}

async function updateCkanPackage(
    ckanClient: CkanClient,
    ckanId: string,
    record: Record,
    externalUrl: string
) {
    const data = await createCkanPackageDataFromDataset(
        ckanClient,
        externalUrl,
        record
    );
    const existingData = await ckanClient.getPackage(ckanId);
    const newData = {
        ...existingData,
        ...data
    };

    const distributions = await await createCkanDistributionsFromDataset(
        ckanClient,
        externalUrl,
        record
    );

    if (distributions.length) {
        newData.resources = distributions;
    }

    const pkg = await ckanClient.callCkanFunc("package_update", newData);
    return pkg.id;
}

export default async function onRecordFound(
    ckanClient: CkanClient,
    externalUrl: string,
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
                        await updateCkanPackage(
                            ckanClient,
                            ckanId,
                            recordData,
                            externalUrl
                        );
                    } else {
                        ckanId = await createCkanPackage(
                            ckanClient,
                            recordData,
                            externalUrl
                        );
                    }
                } else {
                    ckanId = await createCkanPackage(
                        ckanClient,
                        recordData,
                        externalUrl
                    );
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
