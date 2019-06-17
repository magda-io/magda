import React from "react";
import { withRouter } from "react-router";
import "./AddDatasetProgressMeter.scss";
import iconTick from "assets/tick.svg";
import { History } from "history";

interface StepItem {
    title: string;
    url: string;
}

interface PropsType {
    history: History;
    step: number; // --- 1 to 5
    datasetId?: string;
}

export const Steps: StepItem[] = [
    {
        title: "Add files",
        url: "/dataset/add/files"
    },
    {
        title: "Details and Contents",
        url: "/dataset/add/metadata/${datasetId}/0"
    },
    {
        title: "People and Production",
        url: "/dataset/add/metadata/${datasetId}/1"
    },
    {
        title: "Access and User",
        url: "/dataset/add/metadata/${datasetId}/2"
    },
    {
        title: "Submit for Approval",
        url: "/dataset/add/metadata/${datasetId}/3"
    }
];

const AddDatasetProgressMeter = (props: PropsType) => {
    function renderStepItem(
        item: StepItem,
        idx: number,
        currentStep: number,
        datasetId: string
    ) {
        let statusClass, iconItem;
        if (currentStep < idx + 1) {
            statusClass = "future-item";
            iconItem = <div className="round-number-icon">{idx + 1}</div>;
        } else if (currentStep > idx + 1) {
            statusClass = "past-item";
            iconItem = <img className="step" src={iconTick} />;
        } else {
            statusClass = "current-item";
            iconItem = <div className="round-number-icon">{idx + 1}</div>;
        }
        return (
            <div
                className={`col-sm-2 step-item-container ${statusClass}`}
                onClick={() => {
                    if (statusClass !== "past-item") {
                        return;
                    }
                    props.history.push(
                        item.url.replace("${datasetId}", datasetId)
                    );
                }}
            >
                <div className="step-item">
                    {iconItem}
                    <div className="step-item-title">{item.title}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="row add-dataset-progress-meter">
            <div className="col-sm-2 step-item-heading">
                <div className="heading">{Steps[props.step - 1].title}</div>
            </div>
            <div className="col-sm-10 step-item-body">
                {Steps.map((item, idx) =>
                    renderStepItem(
                        item,
                        idx,
                        props.step,
                        props.datasetId ? props.datasetId : ""
                    )
                )}
            </div>
        </div>
    );
};

export default withRouter(AddDatasetProgressMeter);
