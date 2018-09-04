# Magda

[![GitHub release](https://img.shields.io/github/release/TerriaJS/magda.svg)](https://github.com/TerriaJS/magda/releases)
[![GitLab Pipeline](https://gitlab.com/magda-data/magda/badges/master/pipeline.svg)](https://gitlab.com/magda-data/magda/pipelines)
[![Try it out at search.data.gov.au](https://img.shields.io/badge/try%20it%20out%20at-search.data.gov.au-blue.svg)](https://search.data.gov.au)
[![Join the chat at https://gitter.im/magda-data/Lobby](https://badges.gitter.im/magda-data/Lobby.svg)](https://gitter.im/magda-data/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

Magda is a modern platform built to power a new generation of data portals. Its goal is to improve on existing data portal and management solutions in a number of areas:

-   Discoverability of high-quality and relevant data (particularly through search)
-   Automatic derivation, repair and/or enhancement of data and metadata
-   Seamless federation across multiple data sources
-   Collaboration between data providers and users, as well as between users themselves
-   Quick and effective previewing of datasets, so that the user never has to download a dataset only to find it's not useful
-   An ecosystem that allows extension in any programming language
-   An easy installation and setup process

Magda is a solution for any problem that involves a collection or collections of datasets that need to be searched over, discussed and/or viewed in a single place. It doesn't matter what format the data is in, how well-formed the metadata is, where the data is stored or in how many places, Magda can either work with it or be extended to do so.

The project was started by CSIRO Data61 and Australia's Department of Prime Minister and Cabinet as the future of [data.gov.au](https://data.gov.au), and is currently in alpha at [search.data.gov.au](https://search.data.gov.au). As a result it's ideal for powering open data portals, particularly those that involve federating over a number of other more focused portals - for example data.gov.au is a a federal government portal that publishes its own data and makes it available alongside data from department and state portals. However, it can just as easily be run on an organisational intranet as a central private data portal - and can even be set up to include relevant open data in search results alongside private data without exposing any private data to the internet.

## Current Status

Magda is currently being actively developed. It's now at the point where there is a reasonably stable, documented API, and it's stable in production at https://search.data.gov.au. Currently the developed features mainly center around its use as an open data search engine - we're currently developing features to allow it to host its own data and be usable for private data too.

## Future

Magda has been developed as a search tool for open data, but our ambition is to bring it inside government agencies as well, so that they can use have the same quality of tools for their own private data as they do for open data. We hope to make improvements in a number of areas:

-   An opinionated, highly guided publishing process intended to produce high-quality metadata, rather than simply encourage publishing with any quality of metadata
-   A robust mechanism for authorization that allows for tight controls over who can see what datasets
-   An easy to use administration interface so that the product can be run without needing to use the command line.
-   Workflows to facilitate data sharing and the opening of data, within the software itself

Our current roadmap is available at https://magda.io/doc/roadmap

## Architecture

Magda is built around a collection of microservices that are distributed as docker containers. This was done to provide easy extensibility - Magda can be customised by simply adding new services using any technology as docker images, and integrating them with the rest of the system via stable HTTP APIs. Using Kubernetes for orchestration means that configuration of a customised Magda instance can be stored and tracked as plain text, and instances with identical configuration can be quickly and easily reproduced.

![Magda Architecture Diagram](doc/magda-basic-architecture.png)

### Registry

Magda revolves around the _Registry_ - an unopinionated datastore built on top of Postgres. The Registry stores _records_ as a set of JSON documents called _aspects_. For instance, a dataset is represented as a record with a number of aspects - a basic one that records the name, description and so on as well as more esoteric ones that might not be present for every dataset, like temporal coverage or determined data quality. Likewise, distributions (the actual data files, or URLs linking to them) are also modelled as records, with their own sets of aspects covering both basic metadata once again, as well as more specific aspects like whether the URL to the file worked when last tested.

Most importantly, aspects are able to be declared dynamically by other services by simply making a call with a name, description and JSON schema. This means that if you have a requirement to store extra information about a dataset or distribution you can easily do so by declaring your own aspect. Because the system isn't opinionated about what a record is beyond a set of aspects, you can also use this to add new entities to the system that link together - for instance, we've used this to store projects with a name and description that link to a number of datasets.

### Connectors

Connectors go out to external datasources and copy their metadata into the Registry, so that they can be searched and have other aspects attached to them. A connector is simply a docker-based microservice that is invoked as a [job](https://kubernetes.io/docs/concepts/workloads/controllers/jobs-run-to-completion/). It scans the target datasource (usually an open-data portal), then completes and shuts down. We have connectors for a number of existing open data formats, otherwise you can easily write and run your own.

### Sleuthers

A sleuther is a service that listens for new records or changes to existing records, performs some kind of operation and then writes the result back to the registry. For instance, we have a broken link sleuther that listens for changes to distributions, retrieves the URLs described, records whether they were able to be accessed successfully and then writes that back to the registry in its own aspect.

Other aspects exist that are written to by many sleuthers - for instance, we have a "quality" aspect that contains a number of different quality ratings from different sources, which are averaged out and used by search.

### Search

Datasets and distributions in the registry are ingested into an ElasticSearch cluster, which indexes a few core aspects of each and exposes an API.

### User Interface

Magda provides a user interface, which is served from its own microservice and consumes the APIs. We're planning to make the UI itself extensible with plugins at some point in the future.

## To try the last version (with prebuilt images)

Use https://github.com/magda-io/magda-config

## To build and run from source

https://magda.io/doc/building-and-running

## To get help with developing or running Magda

Talk to us on Gitter!
[![Join the chat at https://gitter.im/magda-data/Lobby](https://badges.gitter.im/magda-data/Lobby.svg)](https://gitter.im/magda-data/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

## Want to talk about deploying this into your agency?

Email us at contact@magda.io.

## Want to contribute?

Great! Take a look at https://github.com/TerriaJS/magda/blob/master/.github/CONTRIBUTING.md :).
