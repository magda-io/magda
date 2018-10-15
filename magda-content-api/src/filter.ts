const wildcard = require("wildcard");

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
