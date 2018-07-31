export default function stripFiltersFromQuery(query) {
    return {
        ...query,
        publisher: [],
        regionId: undefined,
        regionType: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        format: [],
        page: undefined
    };
}
