import * as jsonpath from "jsonpath";
import * as lodash from "lodash";

function getResponsibleParties(dataset: any) {
    return jsonpath
        .nodes(dataset.json, "$..CI_ResponsibleParty[*]")
        .concat(jsonpath.nodes(dataset.json, "$..CI_Responsibility[*]"))
        .concat(
            jsonpath.nodes(
                dataset.json,
                "$..CI_Responsibility[?(@.party.CI_Organisation)]"
            )
        )
        .filter(obj => !obj.path.includes("thesaurusName"))
        .map(obj => obj.value);
}

function groupResponsiblePartiesByRole(responsibleParties: any[]) {
    return lodash.groupBy(responsibleParties, party =>
        jsonpath.value(
            party,
            '$.role[*].CI_RoleCode[*]["$"].codeListValue.value'
        )
    );
}

function getPublishersFromResponsibleParties(responsibleParties: any[]) {
    const byRole = groupResponsiblePartiesByRole(responsibleParties);
    return (
        byRole.publisher ||
        byRole.owner ||
        byRole.distributor ||
        byRole.pointOfContact ||
        byRole.custodian ||
        []
    );
}

function getOrganisationNameFromResponsibleParties(
    responsibleParties: any
): string {
    const organisation =
        jsonpath.value(
            responsibleParties,
            "$[*].organisationName[*].CharacterString[*]._"
        ) ||
        jsonpath.value(
            responsibleParties,
            "$..CI_Organisation[*].name[*].CharacterString[*]._"
        );

    return organisation;
}

export default {
    getResponsibleParties,
    getPublishersFromResponsibleParties,
    getOrganisationNameFromResponsibleParties
};
