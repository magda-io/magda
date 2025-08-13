import React, { FunctionComponent } from "react";
import { ParsedDataset } from "helpers/record";
import { useHistory, useLocation } from "react-router-dom";
import redirect from "helpers/redirect";
import { inPopUpMode } from "helpers/popupUtils";

type PropsType = {
    dataset: ParsedDataset;
    hasEditPermissions: boolean;
};

const DatasetBackToListButton: FunctionComponent<PropsType> = (props) => {
    const { dataset, hasEditPermissions } = props;
    const history = useHistory();
    const location = useLocation();
    const isInPopUpMode = inPopUpMode(location);

    if (!hasEditPermissions) {
        return null;
    }

    const isDatasetEditable =
        dataset?.sourceDetails?.id === "magda" &&
        dataset?.sourceDetails?.type === "internal";

    if (!isDatasetEditable) {
        return null;
    }

    const publishingStatus =
        dataset.publishingState === "published" ? "published" : "draft";

    return isInPopUpMode ? null : (
        <button
            className="au-btn au-btn--secondary ask-question-button"
            disabled={!isDatasetEditable}
            onClick={() => {
                redirect(history, `/settings/datasets/${publishingStatus}`);
            }}
        >
            Dataset Management
        </button>
    );
};

export default DatasetBackToListButton;
