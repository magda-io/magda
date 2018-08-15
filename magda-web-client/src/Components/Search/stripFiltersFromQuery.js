export default function stripFiltersFromQuery(query) {
    return {
        ...query,
        publisher: [],
        organisation: [],
        regionId: undefined,
        regionType: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        format: [],
        page: undefined
    };
}
