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

function temporalExtentElementToProperty(extentElement) {
    const beginTimePosition = get(extentElement, 'TimePeriod', 0, 'begin', 0, 'TimeInstant', 0, 'timePosition', 0);
    const endTimePosition = get(extentElement, 'TimePeriod', 0, 'end', 0, 'TimeInstant', 0, 'timePosition', 0);

    const begin = get(beginTimePosition, '_') || get(beginTimePosition, '$', 'indeterminatePosition', 'value');
    const end = get(endTimePosition, '_') || get(endTimePosition, '$', 'indeterminatePosition', 'value');

    if (begin || end) {
        return {
            start: begin,
            end: end
        }
    } else {
        return undefined;
    }
}

function spatialExtentElementToProperty(extentElement) {
    const west = get(extentElement, 'westBoundLongitude', 0, 'Decimal', 0, '_');
    const south = get(extentElement, 'southBoundLatitude', 0, 'Decimal', 0, '_');
    const east = get(extentElement, 'eastBoundLongitude', 0, 'Decimal', 0, '_');
    const north = get(extentElement, 'northBoundLatitude', 0, 'Decimal', 0, '_');

    if (west !== undefined && south !== undefined && east !== undefined && north !== undefined) {
        return `POLYGON((${west} ${south}, ${east} ${south}, ${east} ${north}, ${west} ${north}, ${west} ${south}))`;
    } else {
        return undefined;
    }
}

function getContactPoint(responsibleParty) {
    if (!responsibleParty) {
        return undefined;
    }

    const contactInfo = get(responsibleParty, 'contactInfo', 0, 'CI_Contact', 0);
    const individual = get(responsibleParty, 'individualName', 0, 'CharacterString', 0, '_');
    const organisation = get(responsibleParty, 'organisationName', 0, 'CharacterString', 0, '_');
    const homepage = get(contactInfo, 'onlineResource', 0, 'CI_OnlineResource', 0, 'linkage', 0, 'URL', 0, '_');
    const address = get(contactInfo, 'address', 0, 'CI_Address', 0);
    const emailAddress = get(address, 'electronicMailAddress', 0, 'CharacterString', 0, '_');

    return [individual || organisation, homepage, emailAddress].filter(element => element !== undefined).join(', ');
}

const identifier = get(dataset, 'fileIdentifier', 0, 'CharacterString', 0, '_');
const dataIdentification = get(dataset, 'identificationInfo', 0, 'MD_DataIdentification', 0);
const serviceIdentification = get(dataset, 'identificationInfo', 0, 'SV_ServiceIdentification', 0);
const identification = dataIdentification || serviceIdentification || {};
const citation = get(identification, 'citation', 0, 'CI_Citation', 0);

const dates = get(citation, 'date').map(date => get(date, 'CI_Date', 0));
const publicationDate = get(findDateWithType(dates, 'creation') || findDateWithType(dates, 'publication'), 'date', 0, 'DateTime', 0, '_');
const modifiedDate = get(findDateWithType(dates, 'revision'), 'date', 0, 'DateTime', 0, '_') || publicationDate;

const extent = get(identification, 'extent', 0, 'EX_Extent', 0);

const datasetContactPoint = getContactPoint(get(dataset, 'contact', 0, 'CI_ResponsibleParty', 0));
const identificationContactPoint = getContactPoint(get(identification, 'pointOfContact', 0, 'CI_ResponsibleParty', 0));
const contactPoint = datasetContactPoint && identificationContactPoint
    ? (datasetContactPoint.length > identificationContactPoint.length ? datasetContactPoint : identificationContactPoint)
    : datasetContactPoint || identificationContactPoint;

const flatMap = libraries.lodash.flatMap;
const distNodes = flatMap(dataset.distributionInfo || [], di =>
    flatMap(di.MD_Distribution || [], mdd =>
        flatMap(mdd.transferOptions || [], to =>
            flatMap(to.MD_DigitalTransferOptions || [], mddto =>
                flatMap(mddto.onLine || [], ol => ol.CI_OnlineResource || [])))));

const pointOfTruth = distNodes.filter(distNode => get(distNode, 'description', 0, 'CharacterString', 0, '_') === 'Point of truth URL of this metadata record')[0];

return {
    title: get(citation, 'title', 0, 'CharacterString', 0, '_'),
    description: get(identification, 'abstract', 0, 'CharacterString', 0, '_'),
    issued: publicationDate,
    modified: modifiedDate,
    languages: (get(dataset, 'language') || []).map(language => get(language, 'CharacterString', 0, '_')),
    publisher: undefined,
    accrualPeriodicity: get(identification, 'resourceMaintenance', 0, 'MD_MaintenanceInformation', 0, 'maintenanceAndUpdateFrequency', 0, 'MD_MaintenanceFrequencyCode', '$', 'codeListValue', 'value'),
    spatial: spatialExtentElementToProperty(get(extent, 'geographicElement', 0, 'EX_GeographicBoundingBox', 0)),
    temporal: temporalExtentElementToProperty(get(extent, 'temporalElement', 0, 'EX_TemporalExtent', 0, 'extent', 0)),
    themes: (get(identification, 'topicCategory') || []).map(topic => get(topic, 'MD_TopicCategoryCode', '0', '_')),
    keywords: (get(identification, 'descriptiveKeywords', 0, 'MD_Keywords', 0, 'keyword') || []).map(keyword => get(keyword, 'CharacterString', '0', '_')),
    contactPoint: contactPoint,
    landingPage: get(pointOfTruth, 'linkage', 0, 'URL', 0, '_')
};
