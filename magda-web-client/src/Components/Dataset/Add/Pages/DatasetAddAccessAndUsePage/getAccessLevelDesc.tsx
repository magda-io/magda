export default function getAccessLevelDesc(
    level?: string,
    orgUnitName?: string
) {
    const orgStr = orgUnitName ? `(${orgUnitName}) ` : "";
    switch (level) {
        case "custodian":
            return `Within selected data custodian ${orgStr}only`;
        case "team":
            return `Within selected dataset managing team ${orgStr}only`;
        case "creatorOrgUnit":
            return `Within your current organizational unit ${orgStr}only`;
        case "selectedOrgUnit":
            return `Within selected organizational unit ${orgStr}only`;
        default:
            return "";
    }
}
