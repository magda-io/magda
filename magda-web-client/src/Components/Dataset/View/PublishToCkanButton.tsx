import React, { FunctionComponent, useState } from "react";
import request from "helpers/request";
import { ensureAspectExists } from "api-clients/RegistryApis";
import { config } from "config";
import AUbutton from "pancake/react/buttons";
import moment from "moment";
import { CkanSyncAspectType } from "../../../helpers/record";
import helpIcon from "assets/help.svg";
import spinnerIcon from "assets/spinner-white.svg";
import "./PublishToCkanButton.scss";
import ckanSyncAspect from "@magda/registry-aspects/ckan-sync.schema.json";

type SyncStatusType = "retain" | "withdraw";

interface StateType {
    isLoading: boolean;
    ckanSyncData: CkanSyncAspectType;
    showCkanSyncDetails: boolean;
    isCkanSyncDetailsLoading: boolean;
}

interface PropsType {
    ckanSyncData: CkanSyncAspectType;
    datasetId: string;
}

function getLabelFromState(state: StateType) {
    const loadingStr = state.isLoading ? " (Processing...)" : "";

    return state.ckanSyncData.status === "retain"
        ? `Withdraw Dataset From Ckan${loadingStr}`
        : `Publish Dataset To Ckan${loadingStr}`;
}

const DefaultCkanSyncData: CkanSyncAspectType = {
    status: undefined,
    hasCreated: false,
    syncRequired: false,
    syncAttempted: false
};

const PublishToCkanButton: FunctionComponent<PropsType> = props => {
    const [state, setState] = useState<StateType>({
        isLoading: false,
        showCkanSyncDetails: false,
        isCkanSyncDetailsLoading: false,
        ckanSyncData: props.ckanSyncData
            ? props.ckanSyncData
            : DefaultCkanSyncData
    });

    async function updateSyncStatus(status: SyncStatusType, datasetId: string) {
        try {
            setState(state => ({
                ...state,
                isLoading: true
            }));
            let ckanSyncData: CkanSyncAspectType;
            try {
                ckanSyncData = await request(
                    "GET",
                    `${config.registryReadOnlyApiUrl}records/${datasetId}/aspects/ckan-sync`
                );
            } catch (e) {
                await ensureAspectExists("ckan-sync", ckanSyncAspect);
                ckanSyncData = { ...DefaultCkanSyncData };
            }
            ckanSyncData = { ...ckanSyncData, status, syncRequired: true };
            ckanSyncData = await request(
                "PUT",
                `${config.registryFullApiUrl}records/${datasetId}/aspects/ckan-sync`,
                ckanSyncData
            );
            setState(state => ({
                ...state,
                isLoading: false,
                ckanSyncData: { ...ckanSyncData }
            }));
        } catch (e) {
            setState(state => ({
                ...state,
                isLoading: false
            }));
            alert(`Failed to update dataset sync status: ${e}`);
        }
    }

    async function updateCkanSyncData(datasetId) {
        try {
            setState(state => ({
                ...state,
                isCkanSyncDetailsLoading: true
            }));
            const ckanSyncData = await request(
                "GET",
                `${config.registryReadOnlyApiUrl}records/${datasetId}/aspects/ckan-sync`
            );
            setState(state => ({
                ...state,
                isCkanSyncDetailsLoading: false,
                ckanSyncData: { ...ckanSyncData }
            }));
        } catch (e) {
            setState(state => ({
                ...state,
                isCkanSyncDetailsLoading: false
            }));
        }
    }

    const ckanSyncData = state.ckanSyncData;

    return (
        <AUbutton
            className="au-btn--secondary publish-to-ckan-button"
            onClick={() =>
                updateSyncStatus(
                    state.ckanSyncData.status !== "withdraw"
                        ? "withdraw"
                        : "retain",
                    props.datasetId
                )
            }
        >
            <span>{getLabelFromState(state)}&nbsp;</span>
            <span
                className="ckan-sync-details-icon"
                onMouseOver={() => {
                    setState(state => ({
                        ...state,
                        showCkanSyncDetails: true
                    }));
                    updateCkanSyncData(props.datasetId);
                }}
                onMouseOut={() => {
                    setState(state => ({
                        ...state,
                        showCkanSyncDetails: false
                    }));
                }}
            >
                <img src={helpIcon} />
            </span>
            {state.showCkanSyncDetails ? (
                <div className="ckan-sync-details">
                    <div className="row">
                        <div className="col-sm-6">Current Sync Status: </div>
                        <div className="col-sm-6">
                            {ckanSyncData.status === "retain"
                                ? "Sync to Ckan"
                                : "Not Sync to Ckan"}
                        </div>
                    </div>
                    <div className="row">
                        <div className="col-sm-6">Ckan Package Created: </div>
                        <div className="col-sm-6">
                            {ckanSyncData.hasCreated ? "Yes" : "No"}
                        </div>
                    </div>
                    <div className="row">
                        <div className="col-sm-6">Pending Sync Required: </div>
                        <div className="col-sm-6">
                            {ckanSyncData.syncRequired
                                ? ckanSyncData.syncAttempted
                                    ? "Yes (Not Attempted Yet)"
                                    : "Yes (Attempted)"
                                : "No"}
                        </div>
                    </div>
                    {ckanSyncData.syncAttempted ? (
                        <div className="row">
                            <div className="col-sm-6">Last Sync Time: </div>
                            <div className="col-sm-6">
                                {ckanSyncData.lastSyncAttemptTime
                                    ? moment(
                                          ckanSyncData.lastSyncAttemptTime
                                      ).format("Do MMM YYYY h:mm:ss a")
                                    : "Not Available"}
                            </div>
                        </div>
                    ) : null}
                    {ckanSyncData.syncError ? (
                        <div className="row">
                            <div className="col-sm-6">Last Sync Error: </div>
                            <div className="col-sm-6">
                                {ckanSyncData.syncError}
                            </div>
                        </div>
                    ) : null}
                    {state.isCkanSyncDetailsLoading ? (
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
