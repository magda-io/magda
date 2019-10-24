import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import MagdaReference from "terriajs/dist/lib/Models/MagdaReference";
import Terria from "terriajs/dist/lib/Models/Terria";
import CommonStrata from "terriajs/dist/lib/Models/CommonStrata";
import { JsonObject } from "terriajs/dist/lib/Core/Json";
import registerCatalogMembers from "terriajs/dist/lib/Models/registerCatalogMembers";
import saveStratumToJson from "terriajs/dist/lib/Models/saveStratumToJson";

registerCatalogMembers();

const terria = new Terria();
const reference = new MagdaReference(undefined, terria);

export default async function onRecordFound(
    record: Record,
    registry: Registry
): Promise<void> {
    const terriaAspect = record.aspects.terria;

    // We don't want the Terria aspect to influence how the record is intepreted.
    record.aspects.terria = undefined;

    reference.setTrait(
        CommonStrata.definition,
        "magdaRecord",
        (record as unknown) as JsonObject
    );

    await reference.loadReference().catch(() => {});

    if (reference.target) {
        const underride = reference.target.strata.get("underride");
        if (underride) {
            const json = saveStratumToJson(reference.target.traits, underride);
            if (terriaAspect) {
                // Patch the existing terria aspect
                await registry
                    .patchRecordAspect(
                        record.id,
                        "terria",
                        [
                            {
                                op: terriaAspect.underride ? "replace" : "add",
                                path: "/underride",
                                value: json
                            }
                        ],
                        record.tenantId
                    )
                    .catch(e => {
                        console.error(e);
                    });
            } else {
                // Brand new terria aspect
                await registry
                    .putRecordAspect(
                        record.id,
                        "terria",
                        {
                            underride: json
                        },
                        record.tenantId
                    )
                    .catch(e => {
                        console.error(e);
                    });
            }
        } else {
            await registry
                .patchRecordAspect(
                    record.id,
                    "terria",
                    [
                        {
                            op: "remove",
                            path: "/underride"
                        }
                    ],
                    record.tenantId
                )
                .catch(e => {
                    console.error(e);
                });
        }
    }
}
