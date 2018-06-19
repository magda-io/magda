// @flow
import type { Organisation } from "../helpers/record";
import { defaultOrganisation } from "../helpers/record";

export function parseOrganisation(
    organisationRaw?: Organisation
): Organisation {
    let error = null;
    if (organisationRaw && !organisationRaw.id) {
        error = organisationRaw.message || "an error occurred";
    }
    if (!organisationRaw) {
        return defaultOrganisation;
    }
    const organisation = {
        name: organisationRaw.name,
        id: organisationRaw.id,
        aspects:
            organisationRaw.aspects &&
            organisationRaw.aspects["organization-details"]
                ? organisationRaw.aspects
                : defaultOrganisation.aspects,
        error: error
    };
    return organisation;
}
