const moment = libraries.moment;

if (!dataset.temporal_coverage_from && !dataset.temporal_coverage_to) {
    return undefined;
}

const interval = setup.parse(
    dataset.temporal_coverage_from,
    dataset.temporal_coverage_to,
    moment.utc(dataset.metadata_modified)
);
if (interval) {
    return {
        intervals: [interval]
    };
} else {
    if (dataset.temporal_coverage_from || dataset.temporal_coverage_to) {
        reportProblem(
            "Unable to interpret temporal_coverage_from/to",
            "Could not parse temporal coverage:\n  from: " +
                dataset.temporal_coverage_from +
                "\n  to: " +
                dataset.temporal_coverage_to
        );
    }
    return undefined;
}
