if (!dataset.distribution) {
    return undefined;
}

return {
    distributions: dataset.distribution.map((distribution, index)  => dataset.identifier + '-' + index)
};
