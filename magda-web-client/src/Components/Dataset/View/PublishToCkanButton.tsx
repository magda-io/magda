import React, { FunctionComponent, useState } from "react";
import request from "helpers/request";
import { ensureAspectExists } from "api-clients/RegistryApis";
import { config } from "config";
import AUbutton from "pancake/react/buttons";
import moment from "moment";
import { CkanPublishAspectType } from "../../../helpers/record";
import helpIcon from "assets/help.svg";
import spinnerIcon from "assets/spinner-white.svg";
import "./PublishToCkanButton.scss";
import ckanPublishAspect from "@magda/registry-aspects/ckan-publish.schema.json";

type PublishStatusType = "retain" | "withdraw";

interface StateType {
    isLoading: boolean;
    ckanPublishData: CkanPublishAspectType;
    showCkanPublishDetails: boolean;
    isCkanPublishDetailsLoading: boolean;
}

interface PropsType {
    ckanPublishData: CkanPublishAspectType;
    datasetId: string;
}

function getLabelFromState(state: StateType) {
    const loadingStr = state.isLoading ? " (Processing...)" : "";

    return state.ckanPublishData.status === "retain"
        ? `Withdraw Dataset From Ckan${loadingStr}`
        : `Publish Dataset To Ckan${loadingStr}`;
}

const DefaultCkanPublishData: CkanPublishAspectType = {
    status: "withdraw",
    hasCreated: false,
    publishRequired: false,
    publishAttempted: false
};

const PublishToCkanButton: FunctionComponent<PropsType> = props => {
    const [state, setState] = useState<StateType>({
        isLoading: false,
        showCkanPublishDetails: false,
        isCkanPublishDetailsLoading: false,
        ckanPublishData: props.ckanPublishData
            ? props.ckanPublishData
            : DefaultCkanPublishData
    });

    async function updatePublishStatus(
        status: PublishStatusType,
        datasetId: string
    ) {
        try {
            setState(state => ({
                ...state,
                isLoading: true
            }));
            let ckanPublishData: CkanPublishAspectType;
            try {
                ckanPublishData = await request(
                    "GET",
                    `${config.registryReadOnlyApiUrl}records/${datasetId}/aspects/ckan-publish`
                );
            } catch (e) {
                await ensureAspectExists("ckan-publish", ckanPublishAspect);
                ckanPublishData = { ...DefaultCkanPublishData };
            }
            ckanPublishData = {
                ...ckanPublishData,
                status,
                publishRequired: true
            };
            ckanPublishData = await request(
                "PUT",
                `${config.registryFullApiUrl}records/${datasetId}/aspects/ckan-publish`,
                ckanPublishData
            );
            setState(state => ({
                ...state,
                isLoading: false,
                ckanPublishData: { ...ckanPublishData }
            }));
        } catch (e) {
            setState(state => ({
                ...state,
                isLoading: false
            }));
            alert(`Failed to update dataset publish status: ${e}`);
        }
    }

    async function updateCkanPublishData(datasetId) {
        try {
            setState(state => ({
                ...state,
                isCkanPublishDetailsLoading: true
            }));
            const ckanPublishData = await request(
                "GET",
                `${config.registryReadOnlyApiUrl}records/${datasetId}/aspects/ckan-publish`
            );
            setState(state => ({
                ...state,
                isCkanPublishDetailsLoading: false,
                ckanPublishData: { ...ckanPublishData }
            }));
        } catch (e) {
            setState(state => ({
                ...state,
                isCkanPublishDetailsLoading: false
            }));
        }
    }

    const ckanPublishData = state.ckanPublishData;

    return (
        <AUbutton
            className="au-btn--secondary publish-to-ckan-button"
            onClick={() =>
                updatePublishStatus(
                    state.ckanPublishData.status !== "withdraw"
                        ? "withdraw"
                        : "retain",
                    props.datasetId
                )
            }
        >
            <span>{getLabelFromState(state)}&nbsp;</span>
            <span
                className="ckan-publish-details-icon"
                onMouseOver={() => {
                    setState(state => ({
                        ...state,
                        showCkanPublishDetails: true
                    }));
                    updateCkanPublishData(props.datasetId);
                }}
                onMouseOut={() => {
                    setState(state => ({
                        ...state,
                        showCkanPublishDetails: false
                    }));
                }}
            >
                <img src={helpIcon} />
            </span>
            {state.showCkanPublishDetails ? (
                <div className="ckan-publish-details">
                    <div className="row">
                        <div className="col-sm-5">Current Publish Status: </div>
                        <div className="col-sm-5">
                            {ckanPublishData.status === "retain"
                                ? "Publish to Ckan"
                                : "Don't publish to Ckan"}
                        </div>
                    </div>
                    <div className="row">
                        <div className="col-sm-5">Ckan Package Created: </div>
                        <div className="col-sm-5">
                            {ckanPublishData.hasCreated ? "Yes" : "No"}
                        </div>
                    </div>
                    <div className="row">
                        <div className="col-sm-5">
                            Pending Publish Required:{" "}
                        </div>
                        <div className="col-sm-5">
                            {ckanPublishData.publishRequired
                                ? ckanPublishData.publishAttempted
                                    ? "Yes (Not Attempted Yet)"
                                    : "Yes (Attempted)"
                                : "No"}
                        </div>
                    </div>
                    {ckanPublishData.publishAttempted ? (
                        <div className="row">
                            <div className="col-sm-5">Last Publish Time: </div>
                            <div className="col-sm-5">
                                {ckanPublishData.lastPublishAttemptTime
                                    ? moment(
                                          ckanPublishData.lastPublishAttemptTime
                                      ).format("Do MMM YYYY h:mm:ss a")
                                    : "Not Available"}
                            </div>
                        </div>
                    ) : null}
                    {ckanPublishData.publishError ? (
                        <div className="row">
                            <div className="col-sm-5">Last Publish Error: </div>
                            <div className="col-sm-5">
                                {ckanPublishData.publishError}
                            </div>
                        </div>
                    ) : null}
                    {state.isCkanPublishDetailsLoading ? (
                        <div className="row details-loading-container">
                            <div>
                                <img src={spinnerIcon} />
                                <div className="details-loading-text">
                                    Loading...
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </AUbutton>
    );
};

export default PublishToCkanButton;
