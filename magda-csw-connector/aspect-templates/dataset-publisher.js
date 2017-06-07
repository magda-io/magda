const jsonpath = libraries.jsonpath;
const responsibleParties = jsonpath.query(dataset.json, '$..CI_ResponsibleParty[*]');
const byRole = libraries.lodash.groupBy(responsibleParties, party => jsonpath.value(party, '$.role[*].CI_RoleCode[*]["$"].codeListValue.value'));
const datasetOrgs = byRole.publisher || byRole.owner || byRole.custodian || [];

if (datasetOrgs.length === 0) {
    return undefined;
} else {
    return {
        publisher: connector.getIdFromJsonOrganization(datasetOrgs[0])
    };
}
