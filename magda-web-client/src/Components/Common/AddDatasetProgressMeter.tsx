import React, { ReactNode } from "react";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";
import { createNewDatasetReset } from "actions/recordActions";
import { Link } from "react-router-dom";
import { withRouter, match } from "react-router";
import "./AddDatasetProgressMeter.scss";
import iconTick from "assets/tick.svg";
import { History, Location } from "history";

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
const stepNumbers = {
    ADD_FILES: 0,
    DETAILS_AND_CONTENTS: 1,
    PEOPLE_AND_PRODUCTION: 2,
    ACCESS_AND_USER: 3,
    SUBMIT_FOR_APPROVAL: 4,
    ALL_DONE: 5
};

export const steps: StepItem[] = [
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
        title: "Submit for Approval",
        url: "/dataset/add/metadata/${datasetId}/4"
    },
    {
        title: "All done!",
        url: "/dataset/add/metadata/${datasetId}/5"
    }
];

export const editSteps: StepItem[] = [
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
        title: "Submit for Approval",
        url: "/dataset/edit/${datasetId}/4"
    }
];

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
        type Status = {
            class: "past-item" | "current-item" | "future-item";
            iconItem: ReactNode;
        };

        const status: Status = (() => {
            if (currentStep < idx) {
                return {
                    class: "future-item",
                    iconItem: <div className="round-number-icon">{idx + 1}</div>
                } as Status;
            } else if (currentStep > idx) {
                return {
                    class: "past-item",
                    iconItem: <img className="step" src={iconTick} />
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

    if (currentStep >= stepNumbers.ALL_DONE) return null;
    return (
        <div className="add-dataset-progress-meter">
            <div className="container">
                <div className="col-sm-2 step-item-heading">
                    <div className="heading">
                        {isEdit ? "Edit a dataset" : "Add a dataset"}
                    </div>
                </div>
                <div className="col-sm-10 step-item-body">
                    {(isEdit ? editSteps : steps).map((item, idx) =>
                        idx < stepNumbers.ALL_DONE
                            ? renderStepItem(item, idx, currentStep, datasetId)
                            : null
                    )}
                </div>
            </div>
        </div>
    );
};

const mapDispatchToProps = dispatch => {
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
