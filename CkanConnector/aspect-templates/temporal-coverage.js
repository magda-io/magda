if (!dataset.temporal_coverage_from && !dataset.temporal_coverage_to) {
    return undefined;
}

// const dateFormats = [
//     DateFormat("yyyy{sep}MM{sep}dd", ChronoUnit.DAYS),
//     DateFormat("dd{sep}MM{sep}yyyy", ChronoUnit.DAYS),
//     DateFormat("MM{sep}dd{sep}yyyy", ChronoUnit.DAYS),
//     DateFormat("MMMMM{sep}yyyy", ChronoUnit.MONTHS),
//     DateFormat("MMMMM{sep}yy", ChronoUnit.MONTHS),
//     DateFormat("yyyy", ChronoUnit.YEARS),
//     DateFormat("yy", ChronoUnit.YEARS)
// ];

// const nowRegexs = [
//     /^current$/i,
//     /^now$/i,
//     /^ongoing$/i
// ];

// function parseDate(raw, shouldRoundUp) {
//     if (!raw) {
//         return undefined;
//     }

//     if (nowRegexs.findIndex(r => raw.match(s)) >= 0) {
//         return dataset.metadata_modified;
//     } else {

//     }
// }

return {
    intervals: [
        {
            start: moment('2017-02-27').format(),
            end: '2017-02-28'
        }
    ]
};
