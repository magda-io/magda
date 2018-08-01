export function retrieveLocalData(key): searchDataType {
    try {
        if (!("localStorage" in window) || !window.localStorage) return [];
    } catch (e) {
        /// http://crocodillon.com/blog/always-catch-localstorage-security-and-quota-exceeded-errors
        return [];
    }
    if (!key || typeof key !== "string")
        throw new Error("Invalid key parameter!");
    try {
        const items = JSON.parse(window.localStorage.getItem(key));
        if (!items || typeof items !== "object" || !items.length) return [];
        return items;
    } catch (e) {
        console.error(
            `Failed to retrieve search save data '${key}' from local storage: ${
                e.message
            }`,
            e
        );
        return [];
    }
}

export function insertItemIntoLocalData(
    key,
    searchData: searchDataType,
    limit = maxSavedItemNumber
) {
    if (!window.localStorage) return [];
    let items = retrieveLocalData(key);
    items = items.filter(item => item.data.q !== searchData.data.q);
    items.unshift(searchData);
    if (limit && limit >= 1) items = items.slice(0, limit);
    try {
        window.localStorage.setItem(key, JSON.stringify(items));
        return items;
    } catch (e) {
        console.error(
            `Failed to save search save data '${key}' to local storage: ${
                e.message
            }`,
            e
        );
        return [];
    }
}

export function deleteItemFromLocalData(key, idx) {
    if (!window.localStorage) return [];
    let items = retrieveLocalData(key);
    items.splice(idx, 1);
    try {
        window.localStorage.setItem(key, JSON.stringify(items));
        return items;
    } catch (e) {
        console.error(
            `Failed to save search save data '${key}' to local storage: ${
                e.message
            }`,
            e
        );
        return [];
    }
}
