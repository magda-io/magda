# Using the Magda API Externally

If you're trying to write something that uses the Magda API externally, there are two main apis that you're likely to be using - Registry and Search. Both of these have API documentation at `/api/v0/apidocs/index.html` on the Magda instance that you're using.

Latest API doc (master branch deployment version) can be found from [here](https://dev.magda.io/api/v0/apidocs/index.html)

## Using the Registry API

The registry api is where most metadata within Magda is stored - datasets, distributions (files), organisations etc, and these are ingested into the search as they change.

When using the registry API, it's important to remember that the registry works a bit like a JSON document store - nearly all data is stored as a `record` that can be retrieved through the `/api/v0/registry/records` endpoint.

### Getting the right kind of records

So how do you know which `record`s are datasets, which are distributions and so on? Each record has a set of `aspect`s, which are JSON documents that match a certain schema. So if you want to get all the datasets, you'd use `GET /api/v0/registry/records?aspect=dcat-dataset-strings`.

### Getting records linked to other records

Records can also be linked to other records - for instance, a dataset is usually linked to a number of distributions (with aspect `dcat-distribution-strings`). You can get the whole thing with the `dereference` parameter. E.g. to get distributions for a dataset, you can use `GET /api/v0/registry/records/<dataset-record-id>?aspect=dataset-distributions&dereference=true`.

### Paging through

Simple pagination with start and limit parameters is very slow in the Registry API. If you want to crawl through all the data available, please use the `nextPageToken` returned with each page, passing it into the `pageToken` parameter to get the next page.

### What's available?

You can see all the aspects and what's in them in https://github.com/magda-io/magda/tree/master/magda-registry-aspects. You can also see all the aspects that a record has at `GET /api/v0/registry/records/summary/<record-id>`

## Using the Search API

Using the search api is pretty straightforward - you can search for datasets, organisations or regions as per the API documentation. Be aware that (at least for now), the schema for datasets and distributions in the search API doesn't match the schema for `dcat-dataset-strings` or `dcat-distribution-strings` in the Registry API, although it's fairly similar.

Also note that paging through to get all the records in the search doesn't work past 10,000 - to get all the data, refer to "Paging through" above.
