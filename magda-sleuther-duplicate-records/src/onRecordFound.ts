import * as _ from "lodash";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
//import unionToThrowable from "@magda/typescript-common/dist/util/unionToThrowable";
import { DuplicateRecordsAspect, DistURL } from "./duplicateRecordsAspectDef";
import FTPHandler from "./FtpHandler";

export var mochaObject: any = { isRunning: false };

export var testGroups: DuplicateRecordsAspect[];

export default async function onRecordFound(
    record: Record,
    registry: Registry,
    retries: number = 5,
    baseRetryDelaySeconds: number = 1,
    base429RetryDelaySeconds = 60,
    ftpHandler: FTPHandler = new FTPHandler()
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
                let distContainer: DistContainer[] = [];
                distContainer.push({
                    url: {
                        url: null,
                        type: null
                    },
                    id: null
                });
                distContainer.push({
                    url: {
                        url: null,
                        type: null
                    },
                    id: null
                });

                
                distContainer[0].url = {
                    url: distribution.aspects["dcat-distribution-strings"]
                        .accessURL as string,
                    type: "accessURL" as "accessURL"
                } || { type: "none" };

                distContainer[1].url = {
                    url: distribution.aspects["dcat-distribution-strings"]
                        .downloadURL as string,
                    type: "downloadURL" as "downloadURL"
                } || { type: "none" };

                distContainer[0].id = distContainer[1].id = distribution.id;

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
            }

            throw new Error(
                "The distribution aspect has the following falsey properties: -aspects \nor \n-aspects[dcat-distribution-strings]\n"
            );
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
    let keys = getKeys(groupedDistContainers);
    var groups: DuplicateRecordsAspect[] = [];

    keys.forEach(function(key) {

        // its not classed as a duplicate if there is a bijection between an unique id and an unique url
        if (groupedDistContainers[key].length > 1) {
            var duplicateRecordsAspect: DuplicateRecordsAspect = {
                url: null,
                ids: []
            };

            duplicateRecordsAspect.url = key;

            groupedDistContainers[key].forEach(function(groupedDistContainers) {
                duplicateRecordsAspect.ids.push(groupedDistContainers.id);
            });

            groups.push(duplicateRecordsAspect);
        }
    });

    if (mochaObject.isRunning) testGroups = groups;
    return Promise.resolve([]);
}

export function testGetKeys(dictionary: any): Array<string> {
    if (mochaObject.isRunning) return getKeys(dictionary);
    throw new Error("This function is called only when testing with mocha");
}

function getKeys(dictionary: any): Array<string> {
    let keys = [];

    for (var key in dictionary) {
        if (dictionary.hasOwnProperty(key)) keys.push(key);
    }

    return keys;
}

/*
*private method
*/
export interface DistContainer {
    url: DistURL;
    id: string;
}

/*interface duplicateRecordsSleuthingResult {
    group: duplicateRecordsAspect;
}*/
