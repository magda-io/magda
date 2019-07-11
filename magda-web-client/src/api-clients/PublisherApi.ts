import { config } from "config";

export function searchPublishers(
    query: string,
    start: number = 1,
    searchResultsPerPage: number = 10
) {
    const url = `${config.searchApiUrl +
        "organisations"}?query=${query}&start=${(start - 1) *
        searchResultsPerPage}&limit=${searchResultsPerPage}`;
    return fetch(url, config.fetchOptions).then(response => {
        if (!response.ok) {
            let statusText = response.statusText;
            // response.statusText are different in different browser, therefore we unify them here
            if (response.status === 404) {
                statusText = "Not Found";
            }
            throw Error(statusText);
        }
        return response.json();
    });
}
