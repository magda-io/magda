Guide to Magda Internals

# Guide to Magda Internals

[[toc]]

# Architecture Diagram

![Magda Architecture.svg](./_resources/e667c3978dec4146a2a755c6917ec36d.svg)

# Components

As a microservices-based system, Magda consists of a number of individual parts. What follows is a description of the responsibility and capabilities of each, in rough alphabetical order.

## Authorization API

The Authorization API has a few responsibilities that also touch on authentication as well (possibly this deserves a refactoring!). It is responsible for:

-   Storing what we know about users
-   Determining what a user is allowed to do
-   Storing the details of Magda's non-federated authentication - e.g. internal Magda passwords and API keys

To make this happen, the Auth API has both its own database and a connection to [Open Policy Agent (OPA)](https://www.openpolicyagent.org/). It wraps an API around OPA that allows it to be called with just a JWT identifying the current user, and automatically passes in the user's details in the format expected by the OPA policies. See [Authorization](#authorization-authz) for more details about how Magda's authn system works.

## Connectors

Connectors are responsible for bringing in data from other sources on a one-time or regular basis. Connectors go out to external datasources and copy their metadata into the Registry, so that they can be searched and have other aspects attached to them. A connector is simply a docker-based microservice that is invoked as a job. It scans the target datasource (usually an open-data portal), then completes and shuts down. We have connectors for a number of existing open data formats, otherwise you can easily write and run your own.

## Content API

The Content API is responsible for everything to do with _content_ - that is, what a user sees and interacts with (as opposed to an admin, or another service within the system). Ideally this would mean that all text seen by a user was managed by the Content API, but in practice only a small amount is, the rest is sadly baked into the UI at this point.

The Content API is like a very very light headless CMS, used by Magda to hold text and files around content - e.g. the text for certain pages, and certain configurable images like logos. Content can be retrieved by ID, or by querying - e.g. the Magda UI makes a query for anything that affects the header or the footer when it does its initial render, and uses the result to determine what should be in those components.

The Content API was created a long time before the Storage API, and hence stores files in its database by base64ing them and putting them in a table - there's possibly an opportunity to use the Storage API for this instead.

## Correspondence API

The Correspondence API is responsible for sending messages to users (_not_ sending them to machines). In practice this currently just means sending emails based on requests from the UI, but it could potentially also take into account other messaging mediums like SMS or push notifications, and other classes of message like notifications about something changing in the system.

Currently the Correspondence API is used to send questions about datasets to the dataset contact point, and send direct questions to the Magda admin email address. In order to route a question to the dataset contact point, it grabs the contact point information from the `dcat-dataset-strings` aspect in the registry and if it can find something that looks like an email in there, it'll use that as the recipient - otherwise it falls back to the default Magda email address.

Email templates are stored in the Content API. The Correspondence API gets the information it needs, passes that information into a template, then uses a configured SMTP server to send out emails. Usually we end up using Mailgun.

## Gateway

The Gateway is responsible for:

-   Proxying requests from outside Magda to the correct service
-   Authenticating users when they sign in
-   Authenticating (not authorising) requests, according to the supplied auth cookie or API key
-   Maintaining sessions

## Minions

A minion is a service that listens for new records or changes to existing records, performs some kind of operation and then writes the result back to the registry. For instance, we have a broken link minion that listens for changes to distributions, retrieves the URLs described, records whether they were able to be accessed successfully and then writes that back to the registry in its own aspect. Minions don't currently really have a responsibility within the system - their responsibility depends on what they're designed to do, which varies.

Other aspects exist that are written to by many minions - for instance, we have a "quality" aspect that contains a number of different quality ratings from different sources, which are averaged out and used by search.

## Registry

The Registry is responsible for:

-   Storing and being the source of truth for the metadata managed by Magda
-   Letting other services know about changes to this metadata

### Records

Everything in the registry, regardless of what it is, is represented as a “record” in the registry - think of it as a similar concept to a row in a database table, or an object in Object-Oriented Programming. Datasets are records, distributions are records, organisations are records, etc.

### Aspects

A record by itself has only an id and a name attached to it. All other metadata sits within “aspects”, instances of which are attached to records.

An aspect is like a class in OOP - it defines how a certain part of a record should look. A record will have instances of a number of aspects - e.g. a dataset might have an aspect to describe its basic metadata (dcat-dataset-strings), another one to describe its currency (currency), and another one to keep track of its sync status with an external ckan repository (ckan-export).

This means that what a record represents isn’t static - it can be changed and added to over time by adding or removing aspects. For example, a record representing a dataset harvested from an external portal might start with a dcat-dataset-strings aspect, but you might want to define your own aspect definition, and then add your own complementary metadata to it.

An aspect consists of an id, a name and a JSON schema, which is used to validate new data as its added.Aspects are able to be declared dynamically by other services by simply making a `PUT` or `POST` call with these details. This means that if you have a requirement to store extra information about a dataset or distribution you can easily do so by declaring your own aspect. Because the system isn't opinionated about what a record is beyond a set of aspects, you can also use this to add new entities to the system that link together - for instance, we've used this to store projects with a name and description that link to a number of datasets.

### Record-Aspects

A record is stored as a set of aspects attached to that record. For instance, a dataset might have a a basic one that records the name, description and so on as well as more esoteric ones that might not be present for every dataset, like temporal coverage or determined data quality. Likewise, distributions (the actual data files, or URLs linking to them) are also modelled as records, with their own sets of aspects covering both basic metadata once again, as well as more specific aspects like whether the URL to the file worked when last tested. These are recorded in the Registry database as "recordaspects" - an instance of an aspect that's attached to a record.

### Events

An event is generated any time something changes in the Registry - generally when a record, aspect or record-aspect is:

-   Created
-   Deleted
-   Modified

Events that record a modification generally record a JSON patch that details what changed inside that entity. Events can be used to track the history of an entity over time, or to reconstruct that entity at a certain time and see what it used to be.

### Webhooks

Webhooks allow services outside the registry (and potentially outside the Magda instance itself, eventually) to be notified of events occurring within the registry, as they occur. A webhook is registered by calling `POST` and specifying what event type(s) are to be listened for, and what aspects are to be listened for, and a URL to call with the event payload. After the webhook is created, the registry will call that URL whenever an event matching the recorded query changes.

For instance, the search indexer keeps the ElasticSearch index up to date by subscribing to nearly every event type that has to do with the `dcat-dataset-strings`, `dataset-distributions` and a few other aspects. When any dataset record is added, deleted or modified in the registry, a webhook is sent to the indexer with details of the change and an up-to-date version of the record, which the indexer either ingests or deletes depending on the event type.

## Search API

The responsibility of the Search API is to provide as powerful of a search function as possible, primarily for datasets and a few other objects (publishers, regions).

It's implemented as a wrapper around ElasticSearch, and allows for searching of datasets, publishers and regions. Note that unlike the Registry, the Search API does not have the same open, schema-less, unopinionated design regarding what it stores and how it stores it - the Search API is specifically designed to search for certain objects like datasets, and has a separate endpoint for each object type.

## Search Indexer

The responsibility of the Search Indexer is to:

-   Set up the ElasticSearch index definitions
-   Put relevant information (datasets, publishers etc) into the ElasticSearch index, so that the [Search API](#search-api) can get it out later.
-   Make other changes to the ElasticSearch index that enable search - e.g. putting regions in so that they can be used for spatial search, loading in the Wordnet synonyms dataset etc.

The Search Indexer is always trying to make sure that the datasets stored in the search index matches what's in the Registry's database - this means both responding to Webhook events and doing an initial load of all the datasets in the registry both the first time Magda is run, and whenever the index definition is changed.

On first startup, the Indexer will also try to set up the regions index - at the moment this only knows how to pull in GeoJSON files of ABS regions from the Terria AWS account's S3 and (slowly) load them in. Currently if this is interrupted it won't be retried unless the entire regions index is deleted :(.

The index definitions used by the Indexer change over time - within the code itself there are index definitions, and these have an integer describing their version. When the indexer starts up, it'll check for the existence of an index with its current version - if it can't find one, it'll create it and start populating it. Because the version to look at can be seperately specified in the Search API, this means that you can have the indexer working on setting up `datasets41`, for instance, while the Search API is still querying against version `datasets40`.

## Storage API

The Storage API is responsible for storing and retrieving files, and applying authorization to those operations.

It acts as a wrapper around [MinIO](https://min.io/), which in turn allows it to be backed by a stateful set or other storage solutions like S3 or Google Storage.

Currently it has a rudimentary authorization mechanism that allows files to be linked to the id of a record in the Registry - only if the requesting user is allowed to see that record are they allowed to download the file. This allows file downloads to be protected in a way that matches record authorization in the Registry.

## Web Server

The web server responsible for serving the files (HTML/JS/CSS) needed to render the front-end, and for passing configuration to the web application. Note that the server logic is specified in the `magda-web-server` directory, but the client-side logic is in `magda-web-client`, which is incorporated into the web server docker image at build time.

# Authentication (authn)

## Internal Requests

For requests between pods within Magda, HTTP requests are authenticated by passing a JWT in the `X-Magda-Session` header, which contains at least `userId` as a claim (but could potentially contain more information). The `userId` claim must be the id of a user that can be looked up using the Auth API, and must be signed using a shared JWT secret that's passed to pods via Kubernetes.

Making a request within Magda with no `X-Magda-Session` is also valid - these are treated as being unauthenticated - i.e. they don't come from a particular user. E.g. this is the case for most requests through data.gov.au, where nearly no one signs in.

## External Requests

For requests that come from outside Magda, authentication is applied at the Gateway, with the help of the [NodeJS Passport library](http://www.passportjs.org/).

Currently an external request can be authenticated in two ways:

### Session Cookie

Magda uses [express-session](https://www.npmjs.com/package/express-session) to manage session-based authentication. When a user signs in (via an endpoint in the gateway, that's called from the front-end), it attaches a cookie to the response that contains a session id, and a session is recorded in the Session DB against it that contains the user id. When subsequent requests come in with that cookie, the gateway will look up the session id, and if it's both valid and unexpired it will get the user id and forward the request to the appropriate internal API with an `X-Magda-Session` header attached (see _Internal Requests_ above) containing that user id.

In this way, only the gateway needs to know that external requests even exist - all other services in Magda can treat internal and external requests identically.

![Untitled-2020-08-17-1517.png](./_resources/4e0b8d8a48a9441e91a3fd498c578bec.png)

### API Key

Recently Magda has added the ability to authenticate via an API Key rather than logging in - this makes it much easier when trying to use the Magda API from code rather than from a browser.

API Keys are created up-front - one user can have zero-to-many API Keys associated with it. An API Key consists of an ID, and the key itself. Currently they're created via the `yarn create-api-key` script, until some kind of control panel functionality to create them is built.

If the request provides `X-Magda-API-Key` and `X-Magda-API-Key-Id` headers, these will be looked up in the Auth API, and if valid, then the request will be forwarded with an `X-Magda-Session` JWT with the user id associated with that API Key.

![Untitled-2020-08-17-1517(1).png](./_resources/b7da510d241d4b13a4f6e1ab08e45be7.png)

# Authorization (authz)

## Legacy System

The authorization system within Magda is very much a work in progress. For most of the project's history, the authz system has boiled down to a boolean: either a user is an admin, or is not an admin, as specified by a value in the users table of the Auth DB. If the user is an admin they can do essentially anything in the system, if the user is _not_ an admin they don't have the ability to make any changes to the system. Magda has been able to get away with having such a simple mechanism in place for quite a while, because for its original data.gov.au use-case nearly every user had the access to view anything and change nothing.

## Future System

Going forward, we want to move to a policy-based authorization system via [Open Policy Agent (OPA)](https://www.openpolicyagent.org/). At the time of writing, this is partially implemented - mostly inside the Registry API.

OPA allows for a _policy_ to be specified to determine whether a specific action should be allowed or denied. These policies are written in OPA's prolog-esque domain-specific-language _Rego_, and can be changed at runtime if necessary.

Evaluating these policies can be accomplished in a number of ways, but the way we do it in Magda is by operating OPA as a RESTful server. The Auth API sits in front of OPA, takes in requests with `X-Magda-Session`, looks up the appropriate user and combines that with other inputs passed in when making the request to OPA's REST API.

### Simple Queries

For simple authorization queries where a service within Magda simply needs to know whether something is allowed or not allowed, the relevant policy can be directly queried, passed what it needs to know and a yes/no answer returned.

![diagram-opa(1).png](./_resources/59a6909cecb84b8ab92fa7ac05ac0bbf.png)

### Partial Evaluation

OPA also has the ability to do [partial evaluation](https://blog.openpolicyagent.org/partial-evaluation-162750eaf422). If you want to query some kind of collection but the user is only allowed to see some records in that collection, you can effectively ask OPA "what should I put in a query to only return what the user is allowed to see".

E.g. Alyce wants to look at a collection of 1,000,000 rows in a database table. The auth policy that applies to these records says that users are only allowed to look at records that they own - so Alyce can only view records that have `"Alyce"` as the value of their `owner` column, and this is only true for 10 evenly distributed records within the 1,000,000.

In order to make this work we could either:

-   Retrieve all 1,000,000 records and send them one-by-one to OPA to see whether Alyce is allowed to see them or not. This will almost certainly be slow.
-   Hard-code the authorisation logic so that we can do a query along the lines of `SELECT * FROM records WHERE owner = 'alyce'` - but then the policy can't be changed without also changing the code, and we've lost any benefit from policy-based auth.
-   _OR_ combining the two, we could send OPA a request with what we know (Alyce's details), what we don't know (the `owner` column), and get it to figure out what we should be asking the database.

This last option is called _partial compilation_, and is a great killer feature in OPA, although the documentation for it is a bit lacking. When queried correctly, OPA will respond with a JSON-based Abstract Syntax Tree (AST), which with a bit of code can be translated into SQL, an ElasticSearch query or whatever else we need.

![diagram-opa-partial-compilation.png](./_resources/7069e0d3c2ad4995b755ad82370ccc06.png)

There are more details on how to turn partial evaluation into SQL evaluation [here](https://blog.openpolicyagent.org/write-policy-in-opa-enforce-policy-in-sql-d9d24db93bf4).

### How Authorization Works in the Registry API

In the registry, we want to ensure that:

-   Different records can have different policies
-   Policies are able to depend on the values inside the record's aspects

In order to make this work, each record in the registry has a policy for read (and eventually for write), which is stored in a column alongside the record. Policies are free to make reference to a value in any aspect.

When retrieving records, the Registry API first does a `SELECT DISTINCT` to get all the individual policies that could possibly apply to the records that are being requested. It then uses partial compilation in order to retrieve an AST for every policy, passing in the details of the user.

It then turns each policy's AST into an SQL clause, `AND`s that together with a `policyId = <that policy id>` statement, and assembles all of those connected by `OR`.

E.g. say there are two policies in the Registry - `clearance` and `ownerOnly`. `clearance` grants access based on whether or not a user has the right security clearance to see the dataset, and `ownerOnly` only grants access to the user who owns that dataset.

So the `clearance` policy might have the rule:

```rego
# in Magda this is actually a string so you can't do <=, but you get the idea
input.object.registry.record["information-security"].classification <= input.user.securityClearance
```

and the `ownerOnly` policy might have the rule:

```rego
input.object.registry.record["dataset-access-control"].ownerId = input.user.id
```

As you can see, these reference different aspects attached to the record, and compare them to the details of the user making the call. So when the call comes in at `/api/v0/registry/records`, the Registry API will first make an API call to get all the possible policies, and the result will be something like `clearance, ownerOnly`.

It'll then make two calls to OPA (one for each policy), passing in the user's details, and get back ASTs of each policy. At the time of writing the AST that comes back is a massive ugly JSON file and parsing it is complicated, but translated to Javascript, a simplified version might look something like:

`clearance`:

```javascript
data.partial.object.registry.record["information-security"].classification <= 2;
```

`ownerOnly`:

```javascript
data.partial.object.registry.record["dataset-access-control"].ownerId ===
    "09c10fd6-ad27-4a48-9b3a-0c0807cfe257";
```

... assuming that the user looks something like:

```json
{
    "classification": 2,
    "userId": "09c10fd6-ad27-4a48-9b3a-0c0807cfe257"
}
```

As you can see, it's used the user details to form a query that we can then turn into SQL:

```sql
# Note: I haven't actually tested this but it should give you the idea
SELECT *
FROM Records
WHERE
	(policyId = 'clearance' AND EXISTS (
		SELECT 1 FROM RecordAspects
		WHERE aspectId = 'information-security'
			AND RecordAspects.recordId = Records.recordId
			AND data->'classification' < 2
	))
	OR
	(policyId = 'ownerOnly' AND EXISTS (
		SELECT 1 FROM RecordAspects
		WHERE aspectId = 'dataset-access-control'
			AND RecordAspects.recordId = Records.recordId
			AND data->'ownerId' = '09c10fd6-ad27-4a48-9b3a-0c0807cfe257'
	))
```

This is a pretty banal example, but the greater implication is that administrators of Magda can write policies to meet their requirements and change them without having to actually change the Magda code - within reason, they can use whatever rules they want in order to figure out whether a user should be able to see a record and implement it just by changing policies in OPA.

![Sequence Diagram OPA.png](./_resources/d7654e0ca55643deba8b0d8bb81a11fb.png)
[Sequence Diagram OPA.drawio](./_resources/9b3b7c3017bb44109aca0d58c844ac66.drawio)

# Structure

## Core Components

Currently, Magda has core components, which are needed by most Magda deployments, and non-core components, which are components that serve specific purposes and are unlikely to be needed in all installations.

The core components are managed in a single monorepo at https://github.com/magda-io/magda. In order to manage the components that are in the monorepo, we use [Lerna](https://github.com/lerna/lerna) and [Yarn Workspaces](https://classic.yarnpkg.com/en/docs/workspaces/). This allows us to run a command like `lerna run build`, which will do the equivalent of running `yarn run build` in every component that has a `build` command in `scripts`.

Most of the core repo's components are written in Typescript, but there are a few Scala-based ones too. Each of these are built by [SBT](https://www.scala-sbt.org/), and there's a parent SBT project to link them all together in the route. Scala-based components also have `package.json` files in them that attempt to glue `lerna` and SBT together - e.g. it the Scala components' package.json files usually define a `build` script that runs `sbt build` when invoked.

The core repo also contains a `scripts` directory, containing a number of javascript-based scripts that perform various utility tasks for Magda, including:

-   Building docker images
-   Generating API documentation
-   Running typescript-based node.js services through nodemon
-   Creating user passwords
-   Creating API keys

## Non-Core Components

In addition to the core of Magda, there are a number of components that are either maintained as separate repositories in the github.com/magda-io organisation, or by completely different developers. These include all minions and connectors maintained by the core Magda team.

In general, the idea is that these are built into separate docker images and helm charts, and seperately deployed into the same Kubernetes namespace as Magda, so that they can interact with the core Magda components.

## Serverless Functions

Recently Magda has introduced serverless functions through [OpenFAAS](https://www.openfaas.com/). These are generally generated from [this template](https://github.com/magda-io/magda-function-template). They're deployed very simililarly to normal non-core components in that you ship a Docker image and a Helm chart, with a few differences:

-   Rather than deploy a stand-alone docker image, you deploy an image that's based on [OpenFAAS' of-watchdog image](https://github.com/openfaas/of-watchdog).
-   Rather than the helm chart being based around a Kubernetes Deployment or some other kind of core Kubernetes object, it will deploy a `Function` object from the `openfaas.com/v1` namespace.
-   Rather than being directly managed by Kubernetes, the function will be managed by an existing installation of OpenFAAS in the Kubernetes namespace being deployed to.

In general, it's advantageous to use a serverless function when the workload is likely to be inconsistent - i.e. if a service will have no load a lot of the time, but a lot of load at other times. This is because OpenFAAS functions are capable of scaling to zero - that is, they can be unloaded when not in use, taking up no resources, and then re-loaded and scaled up when they're called later on.

# Practices

## Formatting

Javascript/Typescript code is formatted via [prettier](https://prettier.io/) - this should happen automatically upon commit. In `magda-web-client`, if code is submitted that hasn't been formatted with prettier, the build will fail.

Similarly, all Scala should be formatted via [scalafmt](https://scalameta.org/scalafmt/). There's no automatic step to do this currently (it takes a lot longer than prettier), but there is an `sbt` task to do it for you, as well as a bunch of editor plugins. If Scala code is committed that hasn't been formatted, it'll fail the build.

## Testing

In general all functionality in Magda should have a test - however, unfortunately not all of it does. If you add _new_ functionality to a back-end component, even if it didn't have a test before, you should try to add them.

The exception to this is the front-end: currently there's no testing of the front-end at all, so it's not expected that these will be added (at least not yet).

In general, Magda favours testing end-to-end inside its microservices, rather than doing pure unit testing. In practice this means that the REST API is tested directly using [supertest](https://github.com/visionmedia/supertest) or [akka http testkit](https://doc.akka.io/docs/akka-http/current/routing-dsl/testkit.html), and only calls out to other services or databases are mocked (and in some cases even those aren't mocked!). This is so we can test the _interface_ of each service, which changes slowly, instead of the _implementation_, which could be totally changed without changing the interface.

### Property-Based Testing

In some places, particularly the Search API and Indexer, Magda makes use of [Property Testing](https://en.wikipedia.org/wiki/Property_testing). This is a style of testing often used in functional programming - rather than create a bunch of tests with manually-created test inputs, you define the range of values that a certain _property_ should hold true for, and the test framework repeatedly runs your test with a range of values.

In general we've been transitioning away from property testing because it makes onboarding so difficult, but they're still present in a number of tests within the codebase, so will probably need to be retained for a while.

## Review

# Build / Continuous Integration

Instructions on building Magda locally can be found [here](https://magda.io/docs/building-and-running.html).

Magda is also built in a CI pipeline on Gitlab CI. You can see recent builds [here](https://gitlab.com/magda-data/magda/pipelines).

The CI pipeline consists of a large number of individual jobs, so that:

-   Jobs can be run in parallel for quicker builds
-   More intensive jobs (particularly anything involving Scala!) can be split off and run on a specific, powerful test runner

Gitlab CI does its builds based on Docker images, so in general the build process looks like:

1. Build the docker images to do the build on, using the last valid images built for `master`
2. Pull in dependencies
3. Compile and test
4. Build docker images
5. (manual) Preview
6. (sometimes) Release

## Previews

One of the cooler things that Magda's CI setup does is allow for complete previews to be deployed into their own namespace on the dev cluster from a branch. If you're logged into Gitlab with the right permissions, and the build is finished, then you can click the "Play" button on one of the preview jobs. There are a few options:

-   Full Preview: This creates a new namespace with a full Magda deployment, then pulls in the most up to date database backup from the dev server. This used to be useful, but as the dev database has grown it's got to the point where it takes days to deploy. Hopefully eventually we'll develop a way to reduce the number of events in the database, and this will become viable again.
-   Full Preview (no data): This creates a new namespace with a full Magda deployment, but sets up the data from scratch rather than pulling in a backup. This is much much quicker (~15 minutes usually), but means that you've got to do the work to create your own test data. Subsequent deployments will _not_ erase the data, so feel free to click it again if you push another commit
-   UI Only Preview: This deploys only the Magda web server, which will use the Magda dev server for an API to back it. Use this if you've made a change that only affects the UI and doesn't change anything in the backend.
-   Stop Preview: Make sure you click this once the branch has been merged, it pulls down whatever preview has been created to free up resources.

# Release

As an application that consists of a number of microservices, databases etc, Magda can't be distributed just as code. As such, there are three main channels of distribution:

-   A Helm chart, which contains Kubernetes configuration that explains: - What docker images to download - How they should communicate - How they should scale - What resources they should take - How to start them up - etc.
-   Docker images, which contain the actual code and runtime for the services
-   NPM packages, which distribute common libraries that can be used by third-party code

## Helm

Magda's Kubernetes configuration is fairly complex - it's distributed as a number of Helm charts:

-   `magda-core`, which contains the core Magda services (see [components](#components))
-   `magda`, which bundles `magda-core` and non-core components like minions and connectors

## Docker

## NPM

# Deployment

## Kubernetes

## Helm

## Terraform

# Architectural Decisions

## Macro

### Why Microservices?

### Why Kubernetes?

### Why Scala?

### Why Node.js?

### Why ElasticSearch?

### Why Gitlab CI?

## Front-end

### Why a Single Page Application, and why Create React App?

## Authn/z

### Why not just store the user id in a JWT and get rid of the session db entirely?

That would work too, but this way we can invalidate sessions whenever we want - see [this blog post](https://developer.okta.com/blog/2017/08/17/why-jwts-suck-as-session-tokens).

### Why only pass the user id, why not all details about the user?

### Why not conventional RBAC/ABAC?
