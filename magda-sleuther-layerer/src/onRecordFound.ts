import * as _ from "lodash";

import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import summarizeAspectDef, {
    SummarizeAspect,
    RetrieveResult
} from "./summarizeAspectDef";
import VALID_FORMATS from "./validFormats"
//created a separate summary API.js file because make a .d.ts will be much easier with 1 file instead of a whole node-summary repo.
import {getSummaryFromURL} from "./summaryAPI"
import unionToThrowable from "@magda/typescript-common/src/util/unionToThrowable";
/*declare function getSummaryFromContent(title: string, content: string): {
    err: any,
    summary: string
}*/

export default async function onRecordFound(
    record: Record,
    registry: Registry,
) {
    const distributions: Record[] =
        record.aspects["dataset-distributions"] &&
        record.aspects["dataset-distributions"].distributions;

    if (!distributions || distributions.length === 0) {
        return Promise.resolve();
    }
    
    // Check each link that we are planning to summarize, validate them
    const linkChecks: DistributionSummary[] = _.flatMap(
        distributions,
        (distribution: Record) =>
            checkDistributionFormat(
                distribution,
                distribution.aspects["dcat-distribution-strings"]
            )
    );

    // Group the checks against their host so that we're only making one request for something to summarize per site simultaneously.
    const retrieveSummariesByHost: Promise<SummarizeSleuthingResult[]>[] = _(
        linkChecks
    )
        .groupBy(check => check.host)
        .values()
        .map((checks: DistributionSummary[]) => checks.map(check => check.op))
        .map(checksForHost =>
            // Make the checks for this host run one after the other but return their results as an array.
            checksForHost.reduce(
                (
                    megaPromise: Promise<SummarizeSleuthingResult[]>,
                    promiseLambda: () => Promise<SummarizeSleuthingResult>
                ) =>
                    megaPromise.then(
                        (megaResult: SummarizeSleuthingResult[]) =>
                            promiseLambda().then(promiseResult =>
                                megaResult.concat([promiseResult])
                            )
                    ),
                Promise.resolve([])
            )
        )
        .value();
        
        


    const checkResultsPerHost: SummarizeSleuthingResult[][] = await Promise.all(
        retrieveSummariesByHost
    );

    console.log('checkresult ' + checkResultsPerHost);

    var flattenedSummaries: SummarizeSleuthingResult[] = [].concat.apply([], checkResultsPerHost);
    console.log(flattenedSummaries); 

    // gathering all the sleuthering results so that we can put them all into the database at once
    let recordSummaries: SummarizeSleuthingResult[];
    linkChecks.map(linkCheck => {
        linkCheck.op().then(result => {
            recordSummaries.push(result);
        }).catch(err => {
            console.log("an error occured in the op method inside checkDistributionFormat: " + err);
        });
    });

    // put sleuthering results into the database, and store their promises so we can return them in this function
    const recordSummaryPromise: Promise<Record[]> = Promise.all(recordSummaries.map(recordSummary => {
        return recordSummaryAspect(registry, recordSummary);
    }));

    await Promise.all([recordSummaryPromise]); //Promise.all([summarizeAspectPromise]);
}

function recordSummaryAspect(registry: Registry, result: SummarizeSleuthingResult): Promise<Record> {
    return registry.putRecordAspect(result.distribution.id, summarizeAspectDef.id, result.aspect).then(unionToThrowable);
}

type DistributionSummary = {
    host?: string,
    op: () => Promise<SummarizeSleuthingResult>
}

/**
 * checks to make sure all files are a format that can be summarized
 * @param distribution The distribution Record
 * @param distStringsAspect The dcat-distributions-strings aspect for this distribution
 */

 //@private

function checkDistributionFormat(
    distribution: Record,
    distStringsAspect: any
): DistributionSummary[] {
    type DistURL = {
        url?: string;
        type: "downloadURL" | "accessURL";
    };

    const urls: DistURL[] = [
        {
            url: distStringsAspect.downloadURL as string,
            type: "downloadURL" as "downloadURL"
        },
        {
            url: distStringsAspect.accessURL as string,
            type: "accessURL" as "accessURL"
        }
    ].filter(x => !!x.url);

    // returning: A promise. Fulfilled state: returns a summary, reject state: returns the reason why a summary wont work.
    // summary = "" if a promise is of a rejected format. 
    return urls.map(url => {
        return  {
            op: () =>
                retrieveSummary(url.url)
                    .then(aspect => ({
                        distribution,
                        aspect,
                        urlType: url.type
                        
                    }))
                    .catch(err => ({
                        distribution,
                        aspect: {
                            status: "isNotValid" as RetrieveResult,
                            errorDetails: err
                        },
                        urlType: url.type
                    })) as Promise<SummarizeSleuthingResult>
                }
    });
}

interface SummarizeSleuthingResult {
    distribution: Record;
    aspect?: SummarizeAspect;
    urlType: "downloadURL" | "accessURL";
}

// nextime, add a promise to containsValidExtension, so that we can separate the 
//errors in containsValidExtensions from the errors in retrieveSummary.
// @ private
export function retrieveSummary(url: string): Promise<SummarizeAspect> {
    const promise = new Promise<SummarizeAspect>((resolve, reject) => {
        if(isValidFormat(url)) {
            let info = getSummaryFromURL(url);
            if(info.err) {
                reject("error with SummaryAPI:\n"+info.err);
            } else {
                resolve({
                    status: "isValid",
                    summary: info.summary
                })
            }
        } else {
            reject(new Error("the file type of " + url + " isnt one of:" + VALID_FORMATS.join()))
        }
    });

    return promise;
}

// helper functions
// .*\.(txt|pdf) if txt and pdf are valid.
//@ private
export function getRegexFromFormats(formats: string[]): string {
    let regexArr = formats.map(str => {
        return str.substr(1, str.length - 1) + "|";
    });
    let regex = regexArr.join('');
    regex = regex.substr(0, regex.length - 1);

    return ".*\.(" + regex + ")";

}

//@ private
export function isValidFormat(str: string): boolean {
    return str.match(getRegexFromFormats(VALID_FORMATS)) != null;
}

// turns all valid types into a html body with readable text because node-summary requires input to be in a html form
// should only be called if body is valid
//@private
export function htmlIfy(body: any) {
    
}