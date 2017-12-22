import * as _ from "lodash";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
//import unionToThrowable from "@magda/typescript-common/dist/util/unionToThrowable";
import { DuplicateRecordsAspect, DistURL } from "./duplicateRecordsAspectDef";

export var mochaObject: any = { isRunning: false };

export var testGroups: DuplicateRecordsAspect[];

export default async function onRecordFound(
    record: Record,
    registry: Registry,
    retries: number = 5,
    baseRetryDelaySeconds: number = 1,
    base429RetryDelaySeconds = 60
) {
    const distributions: Record[] =
        record.aspects["dataset-distributions"] &&
        record.aspects["dataset-distributions"].distributions;

    if (!distributions || distributions.length === 0) {
        return Promise.resolve();
    }

    // DistContainer contains only the properties we need, putting all distributions into this will help manipulate the data.
    const distributionContainers: DistContainer[] = _.flatten(
        distributions.map(function(distribution) {
            if (
                distribution.aspects &&
                distribution.aspects["dcat-distribution-strings"]
            ) {
                const distContainer: DistContainer[] = [
                    {
                        url: distribution.aspects["dcat-distribution-strings"]
                            .accessURL
                            ? {
                                  url: distribution.aspects[
                                      "dcat-distribution-strings"
                                  ].accessURL as string,
                                  type: "accessURL" as "accessURL"
                              }
                            : { 
                                url: null,
                                type: "none" },
                        id: distribution.id
                    },
                    {
                        url: distribution.aspects["dcat-distribution-strings"]
                            .downloadURL
                            ? {
                                  url: distribution.aspects[
                                      "dcat-distribution-strings"
                                  ].downloadURL as string,
                                  type: "downloadURL" as "downloadURL"
                              }
                            : { url: null,
                                type: "none" },
                        id: distribution.id
                    }
                ];

                // adding 2 instances of distcontainer with the same url and same id just adds garbage to the db, so delete it if its the case.
                if (
                    (distribution.aspects["dcat-distribution-strings"]
                        .accessURL as string) ===
                    (distribution.aspects["dcat-distribution-strings"]
                        .downloadURL as string)
                ) {
                    distContainer.pop();
                }

                return distContainer;
            } else {
                throw new Error(
                    "The distribution aspect has the following falsey properties: \n-aspects \nor \n-aspects[dcat-distribution-strings]\n"
                );
            }
        })
    );

    // Put DistContainers into a dictionary grouped by url so that we can easily distinguish duplicates.
    const groupedDistContainers: _.Dictionary<DistContainer[]> = _(
        distributionContainers
    )
        .groupBy(distContainer => {
            return distContainer.url.url;
        })
        .value();

    // Construct a datatype that represents the format of either an aspect or record (its an aspect representation atm) so that we can easily put it
    //into the database.
    const keys = Object.keys(groupedDistContainers);
    const groups: DuplicateRecordsAspect[] = [];

    keys.forEach(function(key) {
        // its not classed as a duplicate if there is a bijection between an unique id and an unique url
        if (groupedDistContainers[key].length > 1) {
            const dduplicateRecordsAspect: DuplicateRecordsAspect = {
                url: key,
                ids: groupedDistContainers[key].map(distContainer => {
                    return distContainer.id;
                })
            }

            groups.push(dduplicateRecordsAspect);
        }
    });

    if (mochaObject.isRunning) testGroups = groups;
    return Promise.resolve();
}

/*
*private interface
*/
export interface DistContainer {
    url: DistURL;
    id: string;
}