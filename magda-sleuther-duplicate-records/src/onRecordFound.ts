import * as _ from "lodash";
//import * as request from "request";
//import * as http from "http";
//import * as URI from "urijs";

//import retryBackoff from "@magda/typescript-common/dist/retryBackoff";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
//import unionToThrowable from "@magda/typescript-common/dist/util/unionToThrowable";
import {
    DuplicateRecordsAspect,
    DistURL,
} from "./duplicateRecordsAspectDef";
//import datasetQualityAspectDef from "@magda/sleuther-framework/dist/common-aspect-defs/datasetQualityAspectDef";
import FTPHandler from "./FtpHandler";

//@test
export var groups: DuplicateRecordsAspect[];

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
    const distributionContainers: DistContainer[] = _.flatten(distributions.map(function(distribution) {

        let distContainer: DistContainer[];

        distContainer[0].url = {
                url: distribution.aspects["dcat-distribution-strings"].accessURL as string,
                type: "accessURL" as "accessURL"
            } || {type: "none" };

        distContainer[1].url = {
                url: distribution.aspects["dcat-distribution-strings"].downloadURL as string,
                type: "downloadURL" as "downloadURL"
            } || { type: "none" };

        distContainer[0].id = distContainer[1].id = distribution.id;

        return distContainer;
    }));

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
    //@production
    //var groups: duplicateRecordsAspect[];

    keys.forEach(function(key) {
        var duplicateRecordsAspect: DuplicateRecordsAspect;
        duplicateRecordsAspect.url = key;

        groupedDistContainers[key].forEach(function(groupedDistContainers) {
            duplicateRecordsAspect.ids.push(groupedDistContainers.id);
        });

        groups.push(duplicateRecordsAspect);
    });

}

//@private
export function getKeys(dictionary: any): Array<string> {
    let keys = [];

    for(var key in dictionary) {
        if(dictionary.hasOwnProperty(key)) keys.push(key);
    }

    return keys;
}

//@private
export interface DistContainer {
    url: DistURL;    
    id: string;
}

/*interface duplicateRecordsSleuthingResult {
    group: duplicateRecordsAspect;
}*/



