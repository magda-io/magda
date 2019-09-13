<p class="center">
    <iframe width="560" height="315" src="https://www.youtube.com/embed/gcwqjD-bnhk" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</p>

# Let your data mingle

Government agencies, private companies and research organisations generally do a great job of _seeing_ their data as an asset, but they have to overcome many difficulties to _use_ it as one. Creating quality data and metadata is a difficult, manual and thankless process, and once a dataset is created it's hard for data creators to see how their data is being used, or whether it's being used at all. Using data is no easier - data tends to sit inside silos formed by the teams who collect it, invisible and inaccessible to others in the organisation. Even if datasets are able to be seen and used they're hard to find due to poor metadata and search functionality, and once a dataset is found there's no way to know whether it's reliable or up to date.

## A platform for every part of the data landscape

Magda is an open-source software platform designed to assist in all areas of the data ecosystem, from collection and authoring, through internal discovery and use, all the way to sharing inter-organisation or publishing on an open data portal. Originally developed as an open data aggregator for [data.gov.au](https://data.gov.au), after extensive research how data is used in the public, research and private sector, it is now being extended into a set of components that can be arranged for many use-cases - internal private data portals, public open-data aggregators, limited data access portals for organisational partners, or any combination, with various users able to access different datasets depending on their permission level.

## Features

#### Powerful search

The easiest way to find a dataset is by searching for it, and Magda puts its search functionality front and centre. Magda is able to rate datasets by their quality and return the best ones at the top of the search, understand synonyms and acronyms, as well as provide a number of advanced filters including the ability to search for datasets that affect a certain spatial region or a time period.

<p class="center">
    <img src="./assets/filter-screenshot.png">
</p>

#### Easy federation

Magda was originally developed to power [data.gov.au](https://data.gov.au), which aggregates over twenty different sources, and as a result being able to federate with other data sources is a first-class capability. Magda can be used to seamlessly combine many open data portals into one, easily-searchable repository, or an internal data registry can be enhanced by importing relevant open data sources and having open datasets appear beside private ones.

#### Rich previews

Ensure that your users can quickly determine if a dataset is useful for them with charting, spatial preview with [TerriaJS](https://terria.io) and automatic charting of tabular data.

<p class="center">
    <img src="./assets/screenshot-preview.png">
</p>

#### Automatic metadata enhancement

The metadata that describes datasets is often poorly formatted or completely absent, making them difficult to search for and understand. Magda is able to enhance the metadata of both locally hosted and external datasets in by checking for broken links, normalising formats, calculating quality and determining the best means of visualisation.

#### Open architecture

Magda is designed as a set of microservices that allow extension by simply adding more services into the mix. Extensions to collect data from different data sources or enhance metadata in new ways can be written in any language and added or removed from a running deployment without downtime and no effect on upgrades of the core product.

<p class="center">
    <img src="./docs/magda-basic-architecture.png">
</p>

#### Easy set up and upgrades

Magda uses Kubernetes and Helm to allow for simple installation and minimal downtime upgrades with a single command. Deploy it to the cloud, your on-premises setup or even your local machine with the same set of commands.

## Currently Under Development

In the last quarter of 2018 the Magda team was involved in a massive research effort to determine and find out how to solve the biggest pains facing users of data in the public, private and research sectors. As a result, working with our partners in the Australia's Digital Transformation Agency, Department of Agriculture and Department of the Environment, we're expanding the Magda platform with these features:

#### A better way to publish data

Authoring a quality dataset is hard - not only does it involve a lot of manual work, but it also requires a great deal of up-front knowledge and data literacy. We're building a guided, opinionated and heavily automated publishing process into Magda that will result in an easier time for those who publish data, and higher metadata quality to make it easier to search and use datasets for data users downstream.

#### Keeping data users up to date

Confidence in data-driven policy and decision making is compromised if users can't be sure they have the most recent version of a dataset. We're building in features to keep data users notified when datasets that they use are updated, keep track of duplicates, and reduce the need for duplication by enabling more analysis to be done without the need for downloading artifacts directly.

#### See the impact of your data

A common complaint among data publishers is that they don't know how, how much or even if their data is used in order to prioritise their work. This gets worse at an organisational level: managers aren't able to make decisions on how to prioritise investments in data because they don't know how their existing data is being used. Magda will collect analytics on how data is used, at both a fine-grained and high level. Magda will also expand on its existing ability to collect feedback and foster communities around data.

## Be a part of the future

We're currently looking for more co-creation partners, so if you're part of an organisation that uses data and this sounds like something you'd like to be a part of, we'd love to talk to you! Please get in contact with us at [contact@magda.io](mailto:contact@magda.io).

## See it in action

Magda currently powers Australia's open data portal [data.gov.au](https://data.gov.au), serving tens of thousands of users per week.

<p class="center">
    <img src="./assets/search-screenshot.png">
</p>

Magda is also used by CSIRO Land and Water's [Knowledge Network](https://knowledgenet.co/), as well as the Australian Federal Department of Agriculture and Water Resources and Department of the Environment, in internal-only instances.

## Want to get it running yourself?

[Try the latest version](https://github.com/magda-io/magda-config), or [build and run from source](https://magda.io/docs/building-and-running)

## Latest Release

<a href="{{ site.github.url}}">{{ site.github.latest_release.tag_name }}</a>, released at {{ site.github.latest_release.published_at}}

## Open Source

Magda is fully open source, licensed under the Apache License 2.0. Thanks to all our open source contributors so far:

{% for contributor in site.github.contributors %}<a target="_blank" rel="nofollower noreferrer" href="{{contributor.html_url}}" alt="{{contributor.login}}" title="{{contributor.login}}">
<img src="{{contributor.avatar_url}}" style="width:50px;height:50px;display:inline;">
</a>{% endfor %}

We welcome new contributors too! please check out our [Contributor's Guide](https://github.com/magda-io/magda/blob/master/.github/CONTRIBUTING.md).

## Important links

-   [Our Github](https://github.com/magda-io/magda)
-   [Our documentation](/docs)
-   [Magda API](https://search.data.gov.au/api/v0/apidocs/index.html)

The project was started by CSIRO [Data61](https://data61.csiro.au/) and Australia's [Department of Prime Minister and Cabinet](https://www.pmc.gov.au/). It's progressing thanks to Data61, the [Digital Transformation Agency](https://www.dta.gov.au/), the [Department of Agriculture and Water Resources](http://www.agriculture.gov.au/), the [Department of the Environment and Energy](https://www.environment.gov.au/) and [CSIRO Land and Water](https://www.csiro.au/en/Research/LWF).
