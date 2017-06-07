const jsonpath = libraries.jsonpath;

const identifier = jsonpath.value(dataset, '$.fileIdentifier[*].CharacterString[*]._');
const dataIdentification = jsonpath.query(dataset, '$.identificationInfo[*].MD_DataIdentification[*]');
const serviceIdentification = jsonpath.query(dataset, '$.identificationInfo[*].SV_ServiceIdentification[*]');
const identification = dataIdentification.concat(serviceIdentification);
const citation = jsonpath.query(identification, '$[*].citation[*].CI_Citation[*]');

const dates = jsonpath.query(citation, '$[*].date[*].CI_Date[*]');
const publicationDate = jsonpath.value(findDatesWithType(dates, 'creation').concat(findDatesWithType(dates, 'publication')), '$[*].date[*].DateTime[*]._');
const modifiedDate = jsonpath.value(findDatesWithType(dates, 'revision'), '$[*].date[*].DateTime[*]._') || publicationDate;

const extent = jsonpath.query(identification, '$[*].extent[*].EX_Extent[*]');

const datasetContactPoint = getContactPoint(jsonpath.query(dataset, '$.contact[*].CI_ResponsibleParty[*]'));
const identificationContactPoint = getContactPoint(jsonpath.query(identification, '$[*].pointOfContact[*].CI_ResponsibleParty[*]'));
const contactPoint = datasetContactPoint.length > identificationContactPoint.length ? datasetContactPoint : identificationContactPoint;

const distNodes = jsonpath.query(dataset, '$.distributionInfo[*].MD_Distribution[*].transferOptions[*].MD_DigitalTransferOptions[*].onLine[*].CI_OnlineResource[*]');

const pointOfTruth = distNodes.filter(distNode => jsonpath.value(distNode, '$.description[*].CharacterString[*]._') === 'Point of truth URL of this metadata record');

return {
    title: jsonpath.value(citation, '$[*].title[*].CharacterString[*]._'),
    description: jsonpath.value(identification, '$[*].abstract[*].CharacterString[*]._'),
    issued: publicationDate,
    modified: modifiedDate,
    languages: jsonpath.query(dataset, '$.language[*].CharacterString[*]._').concat(jsonpath.query(dataset, '$.language[*].LanguageCode[*]["$"].codeListValue.value')).filter((item, index, array) => array.indexOf(item) === index),
    publisher: undefined,
    accrualPeriodicity: jsonpath.value(identification, '$[*].resourceMaintenance[*].MD_MaintenanceInformation[*].maintenanceAndUpdateFrequency[*].MD_MaintenanceFrequencyCode[*]["$"].codeListValue.value'),
    spatial: spatialExtentElementToProperty(jsonpath.query(extent, '$[*].geographicElement[*].EX_GeographicBoundingBox[*]')),
    temporal: temporalExtentElementToProperty(jsonpath.query(extent, '$[*].temporalElement[*].EX_TemporalExtent[*].extent[*]')),
    themes: jsonpath.query(identification, '$[*].topicCategory[*].MD_TopicCategoryCode[*]._'),
    keywords: jsonpath.query(identification, '$[*].descriptiveKeywords[*].MD_Keywords[*].keyword[*].CharacterString[*]._'),
    contactPoint: contactPoint,
    landingPage: jsonpath.value(pointOfTruth, '$[*].linkage[*].URL[*]._')
};

function findDatesWithType(dates, type) {
    if (!dates) {
        return [];
    }
    return dates.filter(date => jsonpath.value(date, '$.dateType[*].CI_DateTypeCode[*]["$"].codeListValue.value') === type);
}

function temporalExtentElementToProperty(extentElements) {
    const beginPosition = jsonpath.query(extentElements, '$[*].TimePeriod[*].beginPosition[*]');
    const endPosition = jsonpath.query(extentElements, '$[*].TimePeriod[*].endPosition[*]');
    const beginTimePosition = jsonpath.query(extentElements, '$[*].TimePeriod[*].begin[*].TimeInstant[*].timePosition[*]');
    const endTimePosition = jsonpath.query(extentElements, '$[*].TimePeriod[*].end[*].TimeInstant[*].timePosition[*]');

    const allBegin = beginPosition.concat(beginTimePosition);
    const allEnd = endPosition.concat(endTimePosition);

    const begin = jsonpath.value(allBegin, '$[*]._') || jsonpath.value(allBegin, '$[*]["$"].indeterminatePosition.value');
    const end = jsonpath.value(allEnd, '$[*]._') || jsonpath.value(allEnd, '$[*]["$"].indeterminatePosition.value');

    if (begin || end) {
        return {
            start: begin,
            end: end
        }
    } else {
        return undefined;
    }
}

function spatialExtentElementToProperty(extentElements) {
    const west = jsonpath.value(extentElements, '$[*].westBoundLongitude[*].Decimal[*]._');
    const south = jsonpath.value(extentElements, '$[*].southBoundLatitude[*].Decimal[*]._');
    const east = jsonpath.value(extentElements, '$[*].eastBoundLongitude[*].Decimal[*]._');
    const north = jsonpath.value(extentElements, '$[*].northBoundLatitude[*].Decimal[*]._');

    if (west !== undefined && south !== undefined && east !== undefined && north !== undefined) {
        return `POLYGON((${west} ${south}, ${east} ${south}, ${east} ${north}, ${west} ${north}, ${west} ${south}))`;
    } else {
        return undefined;
    }
}

function getContactPoint(responsibleParties) {
    if (!responsibleParties) {
        return '';
    }

    const contactInfo = jsonpath.query(responsibleParties, '$[*].contactInfo[*].CI_Contact[*]');
    const individual = jsonpath.value(responsibleParties, '$[*].individualName[*].CharacterString[*]._');
    const organisation = jsonpath.value(responsibleParties, '$[*].organisationName[*].CharacterString[*]._');
    const homepage = jsonpath.value(contactInfo, '$[*].onlineResource[*].CI_OnlineResource[*].linkage[*].URL[*]._');
    const address = jsonpath.query(contactInfo, '$[*].address[*].CI_Address[*]');
    const emailAddress = jsonpath.value(address, '$[*].electronicMailAddress[*].CharacterString[*]._');

    return [individual || organisation, homepage, emailAddress].filter(element => element !== undefined).join(', ');
}
