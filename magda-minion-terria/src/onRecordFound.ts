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

export default async function onRecordFound(
    record: Record,
    registry: Registry
): Promise<void> {
    const terriaAspect = record.aspects.terria;

    // We don't want the Terria aspect to influence how the record is intepreted.
    record.aspects.terria = undefined;

    const reference = new MagdaReference(undefined, terria);

    const i3s = reference.addObject(
        CommonStrata.definition,
        "distributionFormats",
        "I3S"
    );
    i3s.setTrait(CommonStrata.definition, "definition", {
        type: "3d-tiles"
    });
    i3s.setTrait(CommonStrata.definition, "urlRegex", "SceneServer");
    i3s.setTrait(
        CommonStrata.definition,
        "formatRegex",
        "Scene\\s?(Service|Server)"
    );

    reference.setTrait(
        CommonStrata.definition,
        "magdaRecord",
        (record as unknown) as JsonObject
    );

    try {
        await reference.loadReference();
    } catch (e) {
        // Do nothing
    }

    const target = reference.target;
    if (target) {
        if (
            target.type === "3d-tiles" &&
            target.url.indexOf("SceneServer") >= 0
        ) {
            // Use the i3s->3d tiles converter
            target.setTrait(
                CommonStrata.underride,
                "url",
                "https://nsw.dt.terria.io/i3s-to-3dtiles/" + target.url // TODO: don't hardcode URL
            );
        }

        const underride = target.strata.get("underride");
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
                            },
                            {
                                op: terriaAspect.type ? "replace" : "add",
                                path: "/type",
                                value: reference.target.type
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
                            type: reference.target.type,
                            underride: json
                        },
                        record.tenantId
                    )
                    .catch(e => {
                        console.error(e);
                    });
            }
        } else if (terriaAspect && terriaAspect.underride) {
            const patches = [
                {
                    op: "remove",
                    path: "/underride"
                }
            ];

            if (terriaAspect.type) {
                patches.push({
                    op: "remove",
                    path: "/type"
                });
            }

            await registry
                .patchRecordAspect(
                    record.id,
                    "terria",
                    patches,
                    record.tenantId
                )
                .catch(e => {
                    console.error(e);
                });
        }
    }
}
