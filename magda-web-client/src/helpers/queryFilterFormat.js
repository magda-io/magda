/**
 * This function takes an array of filters of type string
 * and converts them into array of objects. It is used in the
 * REQUEST_RESULTS action
 * @param {Array[string] || string} queryFilter if multiple filters are selected, the param
 * is an array of strings. If a single filter is selected it is a single string object
 */
export default function (queryFilter) {
    var selectedFilters = [];
    selectedFilters.push(queryFilter);
    // if no filter is selected
    if (!queryFilter) {
        return [];
    } else if (typeof selectedFilters[0] === "string") {
        return [{ value: selectedFilters[0] }];
    } else if (typeof selectedFilters[0] === "object") {
        var returnFilters = [];
        selectedFilters[0].forEach((queryFilter) => {
            returnFilters.push({ value: queryFilter });
        });
        return returnFilters;
    } else {
        return [];
    }
}
