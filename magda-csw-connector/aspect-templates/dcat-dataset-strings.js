function get(o, ...path) {
    while (o !== undefined && path.length > 0) {
        const nextPart = path.shift();
        o = o[nextPart];
    }
    return o;
}

function findDateWithType(dates, type) {
    if (!dates) {
        return undefined;
    }
    return dates.filter(date => get(date, 'dateType', 0, 'CI_DateTypeCode', 0, '$', 'codeListValue', 'value') === type)[0];
}

const identifier = get(dataset, 'fileIdentifier', 0, 'CharacterString', 0, '_');
const dataIdentification = get(dataset, 'identificationInfo', 0, 'MD_DataIdentification', 0);
const serviceIdentification = get(dataset, 'identificationInfo', 0, 'SV_ServiceIdentification', 0);
const identification = dataIdentification || serviceIdentification || {};
const citation = get(identification, 'citation', 0, 'CI_Citation', 0);

const dates = get(citation, 'date').map(date => get(date, 'CI_Date', 0));
const publicationDate = get(findDateWithType(dates, 'creation') || findDateWithType(dates, 'publication'), 'date', 0, 'DateTime', 0, '_');
const modifiedDate = get(findDateWithType(dates, 'revision'), 'date', 0, 'DateTime', 0, '_') || publicationDate;

//const extent = get(identification, 'extent', 0, 'EX_Extent', 0);
//const distNodes = get(dataset, 'distributionInfo', 0, 'MD_Distribution', 0, 'transferOptions', 'MD_DigitalTransferOptions', 'onLine', 'CI_OnlineResource');

return {
    title: get(citation, 'title', 0, 'CharacterString', 0, '_'),
    description: get(identification, 'abstract', 0, 'CharacterString', 0, '_'),
    issued: publicationDate,
    modified: modifiedDate,
    languages: get(dataset, 'language').map(language => get(language, 'CharacterString', 0, '_')),
    publisher: undefined,
    accrualPeriodicity: get(identification, 'resourceMaintenance', 0, 'MD_MaintenanceInformation', 0, 'maintenanceAndUpdateFrequency', 0, 'MD_MaintenanceFrequencyCode', '$', 'codeListValue', 'value'),
    spatial: undefined,
    temporal: undefined,
    themes: get(identification, 'topicCategory').map(topic => get(topic, 'MD_TopicCategoryCode', '0', '_')),
    keywords: get(identification, 'descriptiveKeywords', 0, 'MD_Keywords', 0, 'keyword').map(keyword => get(keyword, 'CharacterString', '0', '_')),
    contactPoint: undefined,
    landingPage: undefined
};
