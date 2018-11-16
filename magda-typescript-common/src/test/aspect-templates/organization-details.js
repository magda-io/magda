const data = {
    name: organization.name,
    description: organization.description
};

Object.keys(data).forEach(key => {
    if (!data[key]) delete data[key];
});

return data;
