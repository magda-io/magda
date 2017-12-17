import * as _ from "lodash";
//import * as request from "request";
//import * as http from "http";
//import * as URI from "urijs";

//import retryBackoff from "@magda/typescript-common/dist/retryBackoff";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import unionToThrowable from "@magda/typescript-common/dist/util/unionToThrowable";
/*import brokenLinkAspectDef, {
    BrokenLinkAspect,
    RetrieveResult
} from "./brokenLinkAspectDef";*/
//import datasetQualityAspectDef from "@magda/sleuther-framework/dist/common-aspect-defs/datasetQualityAspectDef";
import FTPHandler from "./FtpHandler";

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
    
    
}



