import React from "react";
import AUpageAlert from "pancake/react/page-alerts";
import humanFileSize from "helpers/humanFileSize";
import {
    FileSizeCheckStatus,
    FileSizeCheckResult
} from "helpers/DistributionPreviewUtils";
import "./DataPreviewSizeWarning.scss";

export default function DataPreviewSizeWarning({
    fileSizeCheckResult,
    preview
}: {
    fileSizeCheckResult: FileSizeCheckResult;
    preview: () => void;
}) {
    return (
        <AUpageAlert as="info">
            <p>
                {fileSizeCheckResult.fileSizeCheckStatus ===
                FileSizeCheckStatus.Oversize ? (
                    <>
                        Previewing this dataset will require downloading up to{" "}
                        {humanFileSize(fileSizeCheckResult.fileSize)} of data.
                    </>
                ) : (
                    <>
                        We couldn't determine how much data will need to be
                        downloaded in order to preview this dataset.
                    </>
                )}{" "}
                <button onClick={preview} className="preview-anyway-btn">
                    Preview Anyway
                </button>
            </p>
        </AUpageAlert>
    );
}
