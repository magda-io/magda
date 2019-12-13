import React, { FunctionComponent, useState } from "react";
import fetch from "isomorphic-fetch";
import { config } from "config";
import AUbutton from "pancake/react/buttons";
import "./PublishToCkanButton.scss";

type SyncStatusType = "retain" | "withdraw";

interface StateType {
    isLoading: boolean;
    status: SyncStatusType | undefined;
}

interface PropsType {
    status?: SyncStatusType;
}

async function updateSyncStatus(status: SyncStatusType) {
    fetch(config.contentUrl, config.fetchOptions);
}

function getLabelFromState(state: StateType) {
    const loadingStr = state.isLoading ? " (Processing...)" : "";

    return state.status === "retain"
        ? `Withdraw Dataset From Ckan${loadingStr}`
        : `Publish Dataset To Ckan${loadingStr}`;
}

const PublishToCkanButton: FunctionComponent<PropsType> = props => {
    const [state, setState] = useState<StateType>({
        isLoading: false,
        status: props.status ? props.status : undefined
    });

    return (
        <AUbutton
            className="au-btn--secondary publish-to-ckan-button"
            onClick={() => {
                console.log("ssss");
                updateSyncStatus("withdraw");
                setState({ isLoading: true, status: "retain" });
                setTimeout(() => {
                    setState({ isLoading: false, status: state.status });
                }, 2000);
            }}
        >
            {getLabelFromState(state)}
        </AUbutton>
    );
};

export default PublishToCkanButton;
