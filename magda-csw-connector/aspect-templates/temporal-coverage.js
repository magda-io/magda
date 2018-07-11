const jsonpath = libraries.jsonpath;

const dataIdentification = jsonpath.query(
    dataset.json,
    "$.identificationInfo[*].MD_DataIdentification[*]"
);
const serviceIdentification = jsonpath.query(
    dataset.json,
    "$.identificationInfo[*].SV_ServiceIdentification[*]"
);
const identification = dataIdentification.concat(serviceIdentification);
const extent = jsonpath.query(identification, "$[*].extent[*].EX_Extent[*]");
const temporalExtent = jsonpath.query(
    extent,
    "$[*].temporalElement[*].EX_TemporalExtent[*].extent[*]"
);

const beginPosition = jsonpath.query(
    temporalExtent,
    "$[*].TimePeriod[*].beginPosition[*]"
);
const endPosition = jsonpath.query(
    temporalExtent,
    "$[*].TimePeriod[*].endPosition[*]"
);
const beginTimePosition = jsonpath.query(
    temporalExtent,
    "$[*].TimePeriod[*].begin[*].TimeInstant[*].timePosition[*]"
);
const endTimePosition = jsonpath.query(
    temporalExtent,
    "$[*].TimePeriod[*].end[*].TimeInstant[*].timePosition[*]"
);

const allBegin = beginPosition.concat(beginTimePosition);
const allEnd = endPosition.concat(endTimePosition);

let beginValue = jsonpath.value(allBegin, "$[*]._");
const beginIndeterminate = jsonpath.value(
    allBegin,
    '$[*]["$"].indeterminatePosition.value'
);

let endValue = jsonpath.value(allEnd, "$[*]._");
const endIndeterminate = jsonpath.value(
    allEnd,
    '$[*]["$"].indeterminatePosition.value'
);

if (
    (!beginValue && beginIndeterminate === "now") ||
    (!endValue && endIndeterminate === "now")
) {
    const citation = jsonpath.query(
        identification,
        "$[*].citation[*].CI_Citation[*]"
    );
    const dates = jsonpath.query(citation, "$[*].date[*].CI_Date[*]");
    const publicationDate = jsonpath.value(
        findDatesWithType(dates, "creation").concat(
            findDatesWithType(dates, "publication")
        ),
        "$[*].date[*].DateTime[*]._"
    );
    const modifiedDate =
        jsonpath.value(
            findDatesWithType(dates, "revision"),
            "$[*].date[*].DateTime[*]._"
        ) ||
        jsonpath.value(dataset.json, "$.dateStamp[*].DateTime[*]._") ||
        publicationDate;

    if (!beginValue && beginIndeterminate === "now") {
        beginValue = modifiedDate;
    }

    if (!endValue && endIndeterminate === "now") {
        endValue = modifiedDate;
    }
}

if (!beginValue && !endValue && !beginIndeterminate && !endIndeterminate) {
    // No useful temporal coverage information available.
    return undefined;
}

return {
    intervals: [
        {
            start: beginValue,
            startIndeterminate: beginIndeterminate,
            end: endValue,
            endIndeterminate: endIndeterminate
        }
    ]
};

function findDatesWithType(dates, type) {
    if (!dates) {
        return [];
    }
    return dates.filter(
        date =>
            jsonpath.value(
                date,
                '$.dateType[*].CI_DateTypeCode[*]["$"].codeListValue.value'
            ) === type
    );
}
