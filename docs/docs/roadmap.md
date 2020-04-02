# Roadmap

<a href="/docs/past-achievements.png" rel="noopener noreferrer" target="_blank"><img src="/docs/past-achievements.png" alt="Past Achievements"></a>

<a href="/docs/future-roadmap.png" rel="noopener noreferrer" target="_blank"><img src="/docs/future-roadmap.png" alt="Future Roadmap"></a>

## Next Priorities

**Authorisation**: We're using Open Policy Agent to allow the restriction of Magda's resources by writing and assigning policies that can take into account the resource being restricted, the user's details, other information like time etc. This will allow for many different access-control strategies to suit the organisation using Magda - role-based, attribute-based etc, and also allows for Magda to replicate access control for datasets harvested from other sources.

**Cataloging**: We're developing a flow that allows for files to be dropped onto the UI and analyzed in order to automatically extract metadata, without the file necessarily ever being uploaded to a server. In addition, we're building a quick, easy to use AI to create and update metadata records for datasets.

**Duplication**: An unfortunate consequence of data sharing and modification is that often multiple duplicates of a dataset will exist in various parts of an organisation, with no clue as to which is the definitive version or even if there is one. Magda will have new features that allow for duplicate datasets to be detected and aggregated.

**Access Control**: Currently Magda has two roles: `isAdmin=true` and `isAdmin=false`. We want to build Role-Based Access Control into magda so that fine-grained policies can be set as to what users are allowed to change or see what within the system.

**Storage**: Magda currently operates purely on metadata, but doesn't store underlying data. While this isn't as restrictive as it sounds, it does prevent us from adding future features that could provide a great deal of value to users, like APIfication or secure data sharing.

## Longer-Term Ideas

**Administration**: Currently most administration is via config files -

**APIification**: The ability to turn well-formatted datasets into RESTful APIs - this is something that's already offered by CKAN and is depended upon by users of data.gov.au. This may mean replicating how CKAN does it - ingesting the data into a single database and running queries on it - or adopting an AWS Lambda-esque approach where we spin up containers on demand to server requests.

**Exposing Usage to Custodians**: Currently data custodians publish data but have very little idea of how much take-up there is. We want to make it extremely easy for them to see how much their data is being viewed/downloaded.

**Subjective Data Usefulness/Usability/Ease-of-Use/Interest**: On data.gov.au there are many datasets that rate well on the 5-star scale (say a CC-licensed CSV), but are subjectively not as useful as other datasets. Ideally in addition to applying _objective_ measures of quality like the 5-star scale, Magda would also measure datasets _subjectively_, taking into account how useful, usable and relevant to the average user a dataset is. When an internet user searches for a document on the web via Google, they don't just expect the most relevant results to come back, they also expect the highest quality results, which Google determines via a number of measures, some of which apply quite a subjective view of what a high-quality page is. We'd like to develop something similar for Magda: we want to make it so that a search for specific data always returns that data, but more general searches return the most useful and interesting datasets that fit the criteria. Some ideas we're considering:

-   General vs. Specific Interest: e.g. a CSV of a single local council's bin collection dates is only ever going to be useful to a handful of people, and ideally would show up in the search below datasets of a more general interest unless directly searched for.
-   Promoting datasets that match established formats and schemas - e.g. CSV-Geo-Au, Frictionless data
-   Promoting datasets with clear and commonly-used member/column names, e.g. "latitude", "longitude", "date" etc, as these are easier to understand, interpret, link together, visualise etc.
-   Demoting datasets where the primary information is present as ids: e.g. a CSV of dates along with the id of a record of whatever correlates with that date. Sometimes the data that goes along with the ids is present elsewhere and hence the dataset is still useful, but these kinds of datasets are less useful than those that put all the relevant information together for easy consumption, or use IDs in a way that makes it possible to easily combine datasets, e.g. with linked data formats.
-   Demoting datasets where the data is unnecessarily split up into many files, e.g. a CSV for each month: this is easier to publish, but harder to consume.
-   Demoting datasets with inconsistently formatted data: e.g. columns shouldn't switch from one date format to another in row 21000, or introduce text into a column that otherwise consists of numbers.

**Dataset Feedback/Collaboration V2**: Closing the loop between data users and custodians by providing a Quora-styled Q&A interface that allows users to ask questions / report problems with the data, that causes data custodians (as identified in the dataset's metadata) to be notified and invited to join the discussion with the user. Naturally this will also involve building moderation features for administrators and the ability to have some Q&As private.

**Layering**: Allowing for parts of an aspect to be changed in such a way that the next time the dataset is harvested the changes aren't overwritten.

**GraphQL API**: The structure of the registry is effectively a graph, and hence lends itself well to being queries via GraphQL.

**Saved Search**: Just as with eBay you can search for something you want to buy and be emailed when there's new items listed, on Magda you should be able to save a search for data and be notified when new datasets are posted that match it.
