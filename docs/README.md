## A new generation of data portals

Most open data portals are written with publishing in mind, Magda has been built for the federation of data. It doesn't matter what state the metadata is in, or where the data is stored, Magda can work with it.

You can see a working example of it at [Australia's data portal](https://search.data.gov.au/)

Magda is built around a collection of microservices that are distributed as docker containers. This was done to provide easy extensibility. Using Kubernetes means that configuration of a customised Magda instance can be stored and tracked as plain text, and instances with identical configuration can be quickly and easily reproduced.

It's ideal for powering open data portals, particularly those that involve federating over a number of other more focused portals. It can just as easily be run on an organisational intranet as a central private data portal - and can even be set up to include relevant open data in search results alongside private data without exposing any private data to the internet.

Want to see what we're up to in the future? Check out **our [roadmap](https://github.com/magda-io/magda/blob/master/doc/roadmap.md)**

## Features

-   Seamless federation across multiple data sources
-   Enhancement of metadata: Magda takes all kinds of metadata and looks for patterns
-   ElasticSearch and Princeton's synonym library
-   Data visualisation and previews for machine-readable tables
-   Spatial visualisation integration with Terria
-   Quick, lightweight, independent microservices that run inside their own docker container. Use your favourite programming language to build your own!
-   Collaboration between data providers and users

## How you can get involved

1.  Try the latest version [locally](https://github.com/magda-io/magda/blob/master/doc/quickstart.md)
2.  [Build and run](https://github.com/magda-io/magda/blob/master/doc/building-and-running.md) from source
3.  [**Contribute!**](https://github.com/magda-io/magda/blob/master/.github/CONTRIBUTING.md)

## Latest Release

<a href="{{ site.github.url}}">{{ site.github.latest_release.tag_name }}</a>, released at {{ site.github.latest_release.published_at}}

## Contributors

{% for contributor in site.github.contributors %}<a target="_blank" rel="nofollower noreferrer" href="{{contributor.html_url}}" alt="{{contributor.login}}" title="{{contributor.login}}">
<img src="{{contributor.avatar_url}}" style="width:50px;height:50px;display:inline;">
</a>{% endfor %}

The project was started by CSIRO [Data61](https://data61.csiro.au/) and Australia's [Department of Prime Minister and Cabinet](https://www.pmc.gov.au/). It's progressing thanks to Data61 and the [Digital Transformation Agency](https://www.dta.gov.au/)
