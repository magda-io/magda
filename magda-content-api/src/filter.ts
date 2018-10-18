const wildcard = require("wildcard");

/**
 * Filter an array of object by wildcard filters.
 *
 * @param {any[]} items list of input objects to filter
 * @param {any=>string} field function that will return a string to filter given an input object
 * @param {string|string[]} filters wildcard filter or filters to test. Items will be returned if any of the filters match.
 * @return {any[]} list of filtered items
 */
export function simpleFilter(items: any[], field: any, filters: any) {
    if (filters) {
        // we wanna be able to specify multiple filters
        // from express, multiple query of same param come up as an array
        if (typeof filters === "string") {
            filters = [filters];
        }
        items = items.filter((item: any) => {
            const value = field(item);
            // if any of the filters match an item
            for (const filter of filters) {
                if (value === filter || wildcard(filter, value)) {
                    return true;
                }
            }
            return false;
        });
    }
    return items;
}
