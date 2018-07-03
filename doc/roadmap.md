# Roadmap

This is a _loose_ plan of what we're planning to do in Magda in the future. This is provided mainly so potential contributors can see our direction, and so those who are considering using Magda can see where it's going to go in the future. Please keep in keep in mind that this is not a promise - we could change direction at any time (and have done in the past!), so don't make any plans based on this that you can't change! Get in touch if you want to contribute!

## Past Priorities Jan - June 2018

✅ **New Design**: Converting to a new, nicer looking design site-wide, with a focus on usability and simplification.

✅ **Search Results**: Changing the search page based off analysis of how it's been used on data.gov.au and search.data.gov.au - particularly removing the query language and simplifying the way that facets are used.

✅ **Productionising**: Magda has been in alpha at search.data.gov.au for some time, but as we look at making it live as the official data.gov.au we need to make sure it's secure and robust.

✅ **Home Page**: Creating an attractive page for users to land on that draws them into search, blog posts or use cases.

✅ **Format Sleuther**: Currently we trust the metadata that comes with datasets in relation to their format, but this is incredibly inconsistent. We're developing a sleuther that looks at declared format, file extensions and file contents in order to determine the file type.

✅ **Data Page**: Emphasising visualisation of the data via maps and charts, falling back to tables where visualisation isn't appropriate.

✅ **Data Quality**: We currently calculate "data quality" based on an average of how many links work in a dataset and the Tim Berners-Lee 5-star data quality scale, but don't really explain this very well. We're changing this so that it's strictly based on the 5 star scale (broken link = 0 stars, naturally, as it isn't accessible), and making sure we explain this whereever its present.

✅ **MVP Dataset Feedback/Collaboration**: Using the contactPoint info attached to datasets to allow users to directly email data custodians... precursor of the more advanced features below.

## Current Priorities June 2018 - June 2019

**APIification**: The ability to turn well-formatted datasets into RESTful APIs - this is something that's already offered by CKAN and is depended upon by users of data.gov.au. This may mean replicating how CKAN does it - ingesting the data into a single database and running queries on it - or adopting an AWS Lambda-esque approach where we spin up containers on demand to server requests.

**API Documentation**: Currently only the registry API has any documentation and this is often down - an effort needs to be made to clean this up.

**Research: Magda as an Internal Portal**: Building on publishing and access-control, we want to extend Magda so that it's useful for government agencies to run as internal data portals. This involves:

-   Being able to publish data directly
-   Ingesting data from a range of existing applications
-   Allowing each user to search over data that they're allowed to see
-   Providing features to finely control the openness of data - data can be private to the agency or to certain users, completely open or some mix of the two, e.g. users can find the metadata of the dataset but must be approved before the data itself is accessible.
-   Expand federation features - allow an agency to expose certain datasets to other instances of Magda in other agencies for ingestion.

**Authorisation**: User access controls and basic UI

**Publishing**: Currently datasets can only be ingested into Magda from other sources. We want to build in the ability to publish data directly and explore data hosting, making Magda a complete data portal solution in its own right. Our philosophy for data publishing will be opinionated - we want to force custodians to publish data with metadata defined strictly, but we also want to automate this wherever possible - e.g. we won't allow spatial extent to be specified as free text, but we'll also scan the data to auto-generate it where possible.

**User Management/Administration**: Currently it's possible to create an account with Magda and log in, but there's very little ability to change your details, or for administrators to ban or delete abusive accounts - these features need to be added.

**Access Control**: Currently Magda has two roles: `isAdmin=true` and `isAdmin=false`. We want to build Role-Based Access Control into magda so that fine-grained policies can be set as to what users are allowed to change or see what within the system.

## Long-Term Priorities (next 2 years)

**Exposing Usage to Custodians**: Currently data custodians publish data but have very little idea of how much take-up there is. We want to make it extremely easy for them to see how much their data is being viewed/downloaded.

**Subjective Data Usefulness/Usability/Ease-of-Use/Interest**: On data.gov.au there are many datasets that rate well on the 5-star scale (say a CC-licensed CSV), but are subjectively not as useful as other datasets. Ideally in addition to applying _objective_ measures of quality like the 5-star scale, Magda would also measure datasets _subjectively_, taking into account how useful, usable and relevant to the average user a dataset is. When an internet user searches for a document on the web via Google, they don't just expect the most relevant results to come back, they also expect the highest quality results, which Google determines via a number of measures, some of which apply quite a subjective view of what a high-quality page is. We'd like to develop something similar for Magda: we want to make it so that a search for specific data always returns that data, but more general searches return the most useful and interesting datasets that fit the criteria. Some ideas we're considering:

-   General vs. Specific Interest: e.g. a CSV of a single local council's bin collection dates is only ever going to be useful to a handful of people, and ideally would show up in the search below datasets of a more general interest unless directly searched for.
-   Promoting datasets that match established formats and schemas - e.g. CSV-Geo-Au, Frictionless data
-   Promoting datasets with clear and commonly-used member/column names, e.g. "latitude", "longitude", "date" etc, as these are easier to understand, interpret, link together, visualise etc.
-   Demoting datasets where the primary information is present as ids: e.g. a CSV of dates along with the id of a record of whatever correlates with that date. Sometimes the data that goes along with the ids is present elsewhere and hence the dataset is still useful, but these kinds of datasets are less useful than those that put all the relevant information together for easy consumption, or use IDs in a way that makes it possible to easily combine datasets, e.g. with linked data formats.
-   Demoting datasets where the data is unnecessarily split up into many files, e.g. a CSV for each month: this is easier to publish, but harder to consume.
-   Demoting datasets with inconsistently formatted data: e.g. columns shouldn't switch from one date format to another in row 21000, or introduce text into a column that otherwise consists of numbers.

We're planning to do a lot of research into what exactly data consumers find useful

**Dataset Feedback/Collaboration V2**: Closing the loop between data users and custodians by providing a Quora-styled Q&A interface that allows users to ask questions / report problems with the data, that causes data custodians (as identified in the dataset's metadata) to be notified and invited to join the discussion with the user. Naturally this will also involve building moderation features for administrators and the ability to have some Q&As private.

**Layering**: Allowing for parts of an aspect to be changed in such a way that the next time the dataset is harvested the changes aren't overwritten.

**GraphQL API**: The structure of the registry is effectively a graph, and hence lends itself well to being queries via GraphQL.

## Backlog

**Saved Search**: Just as with eBay you can search for something you want to buy and be emailed when there's new items listed, on Magda you should be able to save a search for data and be notified when new datasets are posted that match it.
