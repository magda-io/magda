var dap = libraries.dap;
return {
    type: "dap-dataset",
    url: dap.getPackageShowUrl(dataset.id.identifier),
    id: dap.id,
    name: dap.name
};
