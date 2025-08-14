import React, { FunctionComponent } from "react";
import ToolTip from "Components/Common/TooltipWrapper";
import { ParsedDataset } from "helpers/record";
import { withRouter, match } from "react-router-dom";
import { Location, History } from "history";
import redirect from "helpers/redirect";
import { inPopUpMode } from "helpers/popupUtils";

type PropsType = {
    dataset: ParsedDataset;
    history: History;
    location: Location;
    hasEditPermissions: boolean;
    match: match;
};

const DatasetEditButton: FunctionComponent<PropsType> = (props) => {
    const { dataset, hasEditPermissions, location } = props;
    const isInPopUpMode = inPopUpMode(location);

    if (!hasEditPermissions) {
        return null;
    }

    const isDatasetEditable =
        dataset?.sourceDetails?.id === "magda" &&
        dataset?.sourceDetails?.type === "internal";

    const editButtonTooltipText =
        "This dataset is harvested from outside the system, so it can't be edited here.";

    return isInPopUpMode ? null : (
        <div className="dataset-edit-button-container no-print">
            <button
                className="au-btn au-btn--secondary ask-question-button"
                disabled={!isDatasetEditable}
                onClick={() => {
                    redirect(
                        props.history,
                        `/dataset/edit/${encodeURIComponent(
                            dataset.identifier as string
                        )}`
                    );
                }}
            >
                Edit the Dataset{" "}
            </button>
            {isDatasetEditable ? null : (
                <div className="edit-button-tooltip-container">
                    <ToolTip
                        className="no-print"
                        launcher={(launch) => (
                            <a
                                onClick={launch}
                                className="tooltip-launcher-text"
                            >
                                Why can't I edit this?
                            </a>
                        )}
                        innerElementClassName="inner"
                        orientation="below"
                    >
                        {() => editButtonTooltipText}
                    </ToolTip>
                </div>
            )}
        </div>
    );
};

export default withRouter(DatasetEditButton);
