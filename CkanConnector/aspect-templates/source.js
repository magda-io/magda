return {
    type: 'ckan-dataset',
    url: source.baseUrl.clone().segment('api/3/action/package_show').addSearch('id', dataset.id).toString()
};