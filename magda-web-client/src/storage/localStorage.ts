const noLocalStorage = (() => {
    try {
        return !("localStorage" in window || !window.localStorage);
    } catch (e) {
        /// http://crocodillon.com/blog/always-catch-localstorage-security-and-quota-exceeded-errors
        return false;
    }
})();
/**
 * Retrieves a value from local storage. Will return defaultValue if localStorage isn't available. The value in localStorage will be JSON.parse'd.
 *
 * @param {string} key The key to look for.
 * @param {*} defaultValue Returned if localStorage isn't available on window
 */
export function retrieveLocalData<T>(key: string, defaultValue: T): T {
    if (noLocalStorage) {
        return defaultValue;
    }
    if (!key || typeof key !== "string")
        throw new Error("Invalid key parameter!");
    try {
        const itemData = window?.localStorage?.getItem(key);
        if (typeof itemData !== "string") return defaultValue;
        return JSON.parse(itemData) || defaultValue;
    } catch (e) {
        console.error(
            `Failed to retrieve search save data '${key}' from local storage: ${e.message}`,
            e
        );
        return defaultValue;
    }
}

/**
 * Sets a value in local storage if possible. Returns the value.
 *
 * @param {string} key The key to look for
 * @param {*} value The value to set - will be JSON.stringified.
 * @param {*} defaultValue Returned if localStorage isn't available on window
 */
export function setLocalData(key, value, defaultValue) {
    if (noLocalStorage) {
        return defaultValue;
    }
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return value;
    } catch (e) {
        console.error(
            `Failed to save search save data '${key}' to local storage: ${e.message}`,
            e
        );
        return defaultValue;
    }
}

/**
 * Prepends a value to an array in local storage. Creates the list if array is present. Returns the resulting array.
 *
 * @param {string} key The key to look for
 * @param {*} value The value to set - will be JSON.stringified.
 * @param {*} limit The limit of the array - if this is exceeded by the new value, the last value in the array.
 * @param {*} defaultValue Returned if localStorage isn't available on window
 */
export function prependToLocalStorageArray(
    key,
    value,
    limit = Number.MAX_SAFE_INTEGER,
    defaultValue = []
) {
    let items = retrieveLocalData(key, defaultValue) as any[];
    items = items.filter((item: any) => item.data.q !== value.data.q);
    items.unshift(value);
    if (limit && limit >= 1) {
        items = items.slice(0, limit);
    }
    return setLocalData(key, items, defaultValue);
}

/**
 * Deletes an item from an array in local storage at the specified index. Returns the resulting array.
 *
 * @param {string} key The key to look for
 * @param {number} index  The index of the item to delete.
 * @param {*} defaultValue Returned if localStorage isn't available on window
 */
export function deleteFromLocalStorageArray(key, index, defaultValue = []) {
    if (noLocalStorage) return defaultValue;
    let items = retrieveLocalData(key, []);
    items.splice(index, 1);
    try {
        window.localStorage.setItem(key, JSON.stringify(items));
        return items;
    } catch (e) {
        console.error(
            `Failed to save search save data '${key}' to local storage: ${e.message}`,
            e
        );
        return defaultValue;
    }
}
