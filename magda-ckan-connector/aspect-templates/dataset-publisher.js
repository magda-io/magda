if (!dataset.organization) {
    return undefined;
}

return {
    publisher: dataset.organization.id
};
