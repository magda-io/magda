import React, { useState } from "react";
import { RouteComponentProps, withRouter } from "react-router-dom";
import { connect } from "react-redux";
import { useAsync } from "react-async-hook";
import { State, rawDatasetDataToState } from "../Add/DatasetAddCommon";
import { User } from "reducers/userManagementReducer";
import { config } from "config";
import {
    fetchRecordWithNoCache,
    DEFAULT_OPTIONAL_FETCH_ASPECT_LIST,
    DEFAULT_COMPULSORY_FETCH_ASPECT_LIST
} from "api-clients/RegistryApis";

/* eslint-disable react-hooks/rules-of-hooks */
interface Props extends RouteComponentProps<any> {
    initialState: State;
    user: User;
    isFetchingWhoAmI: boolean;
}

function mapStateToProps(state: any) {
    return {
        user: state.userManagement && state.userManagement.user,
        isFetchingWhoAmI: state.userManagement.isFetchingWhoAmI
    };
}

export default <T extends Props>(Component: React.ComponentType<T>) => {
    const withEditDatasetState = (props: T) => {
        const [state, updateData] = useState<State | undefined>(undefined);
        const isDisabled =
            !config.featureFlags.previewAddDataset &&
            (!props.user ||
                props.user.id === "" ||
                props.user.isAdmin !== true);

        const { loading, error } = useAsync(
            async (isDisabled, datasetId, user) => {
                if (isDisabled || !datasetId) {
                    return;
                }
                // --- turn off cache
                // --- edit flow will also save draft after file is uploaded to storage api
                // --- to avoid orphan uploaded files when the user drops off in the half way before submit
                const data = await fetchRecordWithNoCache(datasetId, [
                    ...DEFAULT_OPTIONAL_FETCH_ASPECT_LIST,
                    ...DEFAULT_COMPULSORY_FETCH_ASPECT_LIST,
                    "dataset-draft"
                ]);
                const loadedStateData = await rawDatasetDataToState(data, user);

                updateData(loadedStateData);
            },
            [isDisabled, props.match.params.datasetId, props.user]
        );

        if (props.isFetchingWhoAmI) {
            return <div>Loading...</div>;
        } else if (isDisabled) {
            return (
                <div
                    className="au-body au-page-alerts au-page-alerts--error"
                    style={{ marginTop: "50px" }}
                >
                    <span>
                        Only admin users are allowed to access this page.
                    </span>
                </div>
            );
        } else if ((!state || loading) && !error) {
            return <div>Loading...</div>;
        } else if (error) {
            return <div>Failed to load dataset data: {"" + error}</div>;
        } else {
            return <Component {...props} initialState={state} />;
        }
    };

    return connect(mapStateToProps)(withRouter(withEditDatasetState) as any);
};

/* eslint-enable react-hooks/rules-of-hooks */
