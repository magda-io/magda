var dap = libraries.dap;

return {
    type: "dap-resource",
    url: dap.getResourceShowUrl(distribution.id),
    id: dap.id,
    name: dap.name
};
