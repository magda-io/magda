import * as _ from "lodash";

import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import { RecordLayer } from "@magda/typescript-common/src/registry-manual/api";
import formatAspectDef, { FormatAspect } from "./formatAspectDef";
import unionToThrowable from "@magda/typescript-common/src/util/unionToThrowable";

import {
    DcatFormatMeasure,
    DownloadMeasure,
    DownloadExtensionMeasure
} from "./format-engine/measures";
import { FormatSnapshotJudge } from "./format-engine/FormatSnapshotEvaluator";
import { Snapshot } from "../../magda-typescript-common/src/format/MeasureSnapShot";

export default async function onRecordFound(
    record: Record,
    registry: Registry
) {
    const distributions: Record[] =
        record.aspects["dataset-distributions"] &&
        record.aspects["dataset-distributions"].distributions;

    if (!distributions || distributions.length === 0) {
        return Promise.resolve();
    }

    const measureBundles: MeasureBundle[] = distributions.map(function(
        distribution
    ) {
        return {
            downloadMeasure: new DownloadMeasure(distribution),
            extensionMeasure: new DownloadExtensionMeasure(distribution),
            dcatMeasure: new DcatFormatMeasure(distribution)
        };
    });

    const judgeResults: FormatSnapshotJudge[] = measureBundles.map(function(
        measureBundle
    ) {
        return new FormatSnapshotJudge({
            snapshots: [].concat(
                measureBundle.downloadMeasure.getSelectedFormats()
                    .selectedFormats,
                measureBundle.extensionMeasure.getSelectedFormats()
                    .selectedFormats,
                measureBundle.dcatMeasure.getSelectedFormats().selectedFormats
            )
        });
    });

    judgeResults.forEach(function(judgeResult) {
        const distribution: Record = judgeResult.getBestSnapshot()
            .chosenSnapshot.output.distribution;
        const aspect: FormatAspect = {
            format: judgeResult.getBestSnapshot().chosenSnapshot.output.format,
            confidenceLevel: judgeResult.getBestSnapshot().confidenceLevel
        };
        recordFormatAspect(registry, distribution, aspect);
    });
}

function recordFormatAspect(
    registry: Registry,
    distribution: Record,
    aspect: FormatAspect
): Promise<Record> {
    return registry
        .putRecordAspect(distribution.id, "source-link-status", aspect)
        .then(unionToThrowable);
}

interface MeasureBundle {
    downloadMeasure: DownloadMeasure;
    extensionMeasure: DownloadExtensionMeasure;
    dcatMeasure: DcatFormatMeasure;
}
