import React, { ReactNode } from "react";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";
import { createNewDatasetReset } from "actions/recordActions";
import { Link } from "react-router-dom";
import { withRouter, match } from "react-router-dom";
import "./AddDatasetProgressMeter.scss";
import iconTick from "assets/tick.svg";
import { History, Location } from "history";
import { config } from "config";
import { BsXCircleFill } from "react-icons/bs";
import Button from "rsuite/Button";

/* eslint-disable no-template-curly-in-string */

type urlFunc = (datasetId: string) => string;
interface StepItem {
    title: string;
    url: string | urlFunc;
}

export interface ExternalProps {
    isEdit?: boolean;
}

interface InternalProps {
    history: History;
    location: Location;
    createNewDatasetReset: Function;
    match: match<{
        datasetId: string;
        step: string;
    }>;
}

/** Lookup for step numbers by page theme */
export const stepMap = {
    ADD_FILES: 0,
    DETAILS_AND_CONTENTS: 1,
    PEOPLE_AND_PRODUCTION: 2,
    ACCESS_AND_USER: 3,
    REVIEW: 4, // optionally turned off by config.featureFlags.datasetApprovalWorkflowOn
    REVIEW_BEFORE_SUBMIT: 5,
    ALL_DONE: 6
};

export const addDatasetSteps: StepItem[] = [
    {
        title: "Add files",
        url: "/dataset/add/metadata/${datasetId}/0"
    },
    {
        title: "Details and Contents",
        url: "/dataset/add/metadata/${datasetId}/1"
    },
    {
        title: "People and Production",
        url: "/dataset/add/metadata/${datasetId}/2"
    },
    {
        title: "Access and User",
        url: "/dataset/add/metadata/${datasetId}/3"
    },
    {
        title: "Review",
        url: "/dataset/add/metadata/${datasetId}/4"
    },
    {
        title: "Review before submitting",
        url: "/dataset/add/metadata/${datasetId}/5"
    },
    {
        title: "All done!",
        url: "/dataset/add/metadata/${datasetId}/6"
    }
];

export const editDatasetSteps: StepItem[] = [
    {
        title: "Your Files and Distributions",
        url: "/dataset/edit/${datasetId}/0"
    },
    {
        title: "Details and Contents",
        url: "/dataset/edit/${datasetId}/1"
    },
    {
        title: "People and Production",
        url: "/dataset/edit/${datasetId}/2"
    },
    {
        title: "Access and User",
        url: "/dataset/edit/${datasetId}/3"
    },
    {
        title: "Review",
        url: "/dataset/edit/${datasetId}/4"
    },
    {
        title: "Review before submitting",
        url: "/dataset/add/metadata/${datasetId}/5"
    },
    {
        title: "All done!",
        url: "/dataset/add/metadata/${datasetId}/6"
    }
];

if (!config.featureFlags.datasetApprovalWorkflowOn) {
    const idx = stepMap.REVIEW;
    addDatasetSteps.splice(idx, 1);
    editDatasetSteps.splice(idx, 1);
}

function createStepUrl(datasetId, item: StepItem) {
    if (typeof item.url === "string") {
        return item.url.replace("${datasetId}", datasetId);
    } else if (typeof item.url === "function") {
        return item.url(datasetId);
    } else {
        throw new Error("Invalid step item config.");
    }
}

const AddDatasetProgressMeter = (props: InternalProps & ExternalProps) => {
    const isEdit = props.isEdit;
    function determineDatasetId() {
        return props.match.params.datasetId;
    }

    function determineCurrentStep() {
        const stepNo = parseInt(props.match.params.step);
        if (Number.isNaN(stepNo)) {
            return 0;
        } else {
            return stepNo;
        }
    }

    function renderStepItem(
        item: StepItem,
        idx: number,
        currentStep: number,
        datasetId: string
    ) {
        if (idx >= stepMap.REVIEW_BEFORE_SUBMIT) {
            return null;
        }

        type Status = {
            class: "past-item" | "current-item" | "future-item";
            iconItem: ReactNode;
        };

        const status: Status = (() => {
            if (
                currentStep >= stepMap.REVIEW_BEFORE_SUBMIT &&
                idx === stepMap.REVIEW
            ) {
                return {
                    class: "current-item",
                    iconItem: <div className="round-number-icon">{idx + 1}</div>
                } as Status;
            }
            if (currentStep < idx) {
                return {
                    class: "future-item",
                    iconItem: <div className="round-number-icon">{idx + 1}</div>
                } as Status;
            } else if (currentStep > idx) {
                return {
                    class: "past-item",
                    iconItem: (
                        <img className="step" src={iconTick} alt="step icon" />
                    )
                } as Status;
            } else {
                return {
                    class: "current-item",
                    iconItem: <div className="round-number-icon">{idx + 1}</div>
                } as Status;
            }
        })();

        const inner = (
            <div className="step-item">
                {status.iconItem}
                <div className="step-item-title">{item.title}</div>
            </div>
        );

        if (status.class === "past-item") {
            return (
                <Link
                    key={idx}
                    className={`col-sm-2 step-item-container past-item ${
                        isEdit ? "is-edit" : ""
                    }`}
                    to={createStepUrl(datasetId, item)}
                    onClick={() => {
                        props.createNewDatasetReset();
                    }}
                >
                    {inner}
                </Link>
            );
        } else if (status.class === "future-item" && isEdit) {
            return (
                <Link
                    key={idx}
                    className={`col-sm-2 step-item-container future-item ${
                        isEdit ? "is-edit" : ""
                    }`}
                    to={createStepUrl(datasetId, item)}
                    onClick={() => {
                        props.createNewDatasetReset();
                    }}
                >
                    {inner}
                </Link>
            );
        } else {
            return (
                <div
                    key={idx}
                    className={`col-sm-2 step-item-container ${status.class}  ${
                        isEdit ? "is-edit" : ""
                    }`}
                >
                    {inner}
                </div>
            );
        }
    }

    const currentStep = determineCurrentStep();
    const datasetId = determineDatasetId();

    if (currentStep >= stepMap.ALL_DONE) {
        return null;
    }
    return (
        <div className="add-dataset-progress-meter">
            <div className="container">
                <div className="col-sm-2 step-item-heading">
                    <div className="heading">
                        {isEdit ? "Edit a dataset" : "Add a dataset"}
                    </div>
                </div>
                <div className="col-sm-10 step-item-body">
                    {(isEdit ? editDatasetSteps : addDatasetSteps).map(
                        (item, idx) => {
                            // Skip the review step if it's turned off
                            if (
                                !config.featureFlags
                                    .datasetApprovalWorkflowOn &&
                                idx === stepMap.REVIEW
                            ) {
                                return null;
                            }
                            return renderStepItem(
                                item,
                                idx,
                                currentStep,
                                datasetId
                            );
                        }
                    )}
                </div>
                {isEdit ? (
                    <Link to="/settings/datasets">
                        <Button className="exit-button" appearance="ghost">
                            <BsXCircleFill /> Exit
                        </Button>
                    </Link>
                ) : null}
            </div>
        </div>
    );
};
/* eslint-enable no-template-curly-in-string */

const mapDispatchToProps = (dispatch) => {
    return bindActionCreators(
        {
            createNewDatasetReset: createNewDatasetReset
        },
        dispatch
    );
};

export default withRouter(
    connect(null, mapDispatchToProps)(AddDatasetProgressMeter)
);
