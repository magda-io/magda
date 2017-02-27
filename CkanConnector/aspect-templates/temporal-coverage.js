if (!dataset.temporal_coverage_from && !dataset.temporal_coverage_to) {
    return undefined;
}

const interval = setup.parse(dataset.temporal_coverage_from, dataset.temporal_coverage_to, moment(dataset.metadata_modified));
if (interval) {
    return {
        intervals: [interval]
    };
} else {
    if (dataset.temporal_coverage_from || dataset.temporal_coverage_to) {
        console.log('Could not parse temporal coverage:\n  from: ' + dataset.temporal_coverage_from + '\n  to: ' + dataset.temporal_coverage_to);
    }
    return undefined;
}
