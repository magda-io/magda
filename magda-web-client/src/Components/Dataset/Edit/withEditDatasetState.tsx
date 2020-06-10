import React, { useState } from "react";
import { RouterProps, withRouter } from "react-router-dom";
import { connect } from "react-redux";
import { useAsync } from "react-async-hook";
import { State, rawDatasetDataToState } from "../Add/DatasetAddCommon";
import { User } from "reducers/userManagementReducer";
import { config } from "config";
import { fetchRecordWithNoCache } from "api-clients/RegistryApis";

/* eslint-disable react-hooks/rules-of-hooks */
type Props = { initialState: State; user: User } & RouterProps;

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
                const data = await fetchRecordWithNoCache(
                    datasetId,
                    undefined,
                    undefined,
                    true
                );
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

    return connect(mapStateToProps)(withRouter(withEditDatasetState));
};

/* eslint-enable react-hooks/rules-of-hooks */
