import React, { FunctionComponent } from "react";
import ToolTip from "Components/Common/TooltipWrapper";
import { ParsedDataset } from "helpers/record";
import { withRouter, RouteComponentProps } from "react-router-dom";

interface PropsType extends RouteComponentProps {
    dataset: ParsedDataset;
    hasEditPermissions: boolean;
}

const DatasetEditButton: FunctionComponent<PropsType> = (props) => {
    const { dataset, hasEditPermissions } = props;

    if (!hasEditPermissions) {
        return null;
    }

    const isDatasetEditable =
        dataset?.sourceDetails?.id === "magda" &&
        dataset?.sourceDetails?.type === "internal";

    const editButtonTooltipText =
        "This dataset is harvested from outside the system, so it can't be edited here.";

    return (
        <div className="dataset-edit-button-container no-print">
            <button
                className="au-btn au-btn--secondary ask-question-button"
                disabled={!isDatasetEditable}
                onClick={() => {
                    props.history.push({
                        pathname: `/dataset/edit/${dataset.identifier}`
                    });
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
