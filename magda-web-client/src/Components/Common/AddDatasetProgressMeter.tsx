import React from "react";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";
import { createNewDatasetReset } from "actions/recordActions";
import { withRouter } from "react-router";
import "./AddDatasetProgressMeter.scss";
import iconTick from "assets/tick.svg";
import { History, Location } from "history";

type urlFunc = (datasetId: string) => string;
interface StepItem {
    title: string;
    url: string | urlFunc;
    testFunc: (url: string) => boolean;
}

interface PropsType {
    history: History;
    location: Location;
    createNewDatasetReset: Function;
}

export const Steps: StepItem[] = [
    {
        title: "Add files",
        url: datasetId =>
            datasetId
                ? `/dataset/add/files/${datasetId}`
                : "/dataset/add/files",
        testFunc: url => url.indexOf("/dataset/add/files") !== -1
    },
    {
        title: "Details and Contents",
        url: "/dataset/add/metadata/${datasetId}/0",
        testFunc: url =>
            url.search(/\/dataset\/add\/metadata\/[^\/]+\/0/) !== -1
    },
    {
        title: "People and Production",
        url: "/dataset/add/metadata/${datasetId}/1",
        testFunc: url =>
            url.search(/\/dataset\/add\/metadata\/[^\/]+\/1/) !== -1
    },
    {
        title: "Access and User",
        url: "/dataset/add/metadata/${datasetId}/2",
        testFunc: url =>
            url.search(/\/dataset\/add\/metadata\/[^\/]+\/2/) !== -1
    },
    {
        title: "Submit for Approval",
        url: "/dataset/add/metadata/${datasetId}/3",
        testFunc: url =>
            url.search(/\/dataset\/add\/metadata\/[^\/]+\/3/) !== -1
    }
];

function determineCurrentStep(location) {
    const { pathname } = location;
    for (let i = 0; i < Steps.length; i++) {
        if (Steps[i].testFunc(pathname)) return i + 1;
    }
    throw new Error("Can't determine current progress step");
}

function determineDatasetId(location) {
    const { pathname } = location;
    const matches = pathname.match(/dataset-[\da-z-]+/);
    if (matches) return matches[0];
    return "";
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
                key={idx}
                className={`col-sm-2 step-item-container ${statusClass}`}
                onClick={() => {
                    if (statusClass !== "past-item") {
                        return;
                    }
                    props.history.push(createStepUrl(datasetId, item));
                    if (props.createNewDatasetReset)
                        props.createNewDatasetReset();
                }}
            >
                <div className="step-item">
                    {iconItem}
                    <div className="step-item-title">{item.title}</div>
                </div>
            </div>
        );
    }

    const currentStep = determineCurrentStep(props.location);
    const datasetId = determineDatasetId(props.location);

    return (
        <div className="row add-dataset-progress-meter">
            <div className="container">
                <div className="col-sm-2 step-item-heading">
                    <div className="heading">Add a dataset</div>
                </div>
                <div className="col-sm-10 step-item-body">
                    {Steps.map((item, idx) =>
                        renderStepItem(item, idx, currentStep, datasetId)
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
    connect(
        null,
        mapDispatchToProps
    )(AddDatasetProgressMeter)
);
