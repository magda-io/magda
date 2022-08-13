import React, { useState } from "react";
import { RouterProps, withRouter } from "react-router-dom";
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
import { findPermissionGap } from "helpers/accessControlUtils";
import Placeholder from "rsuite/Placeholder";
import Loader from "rsuite/Loader";
import { resetFileUploadMarkers } from "../Add/Pages/AddFiles/uploadFile";

const Paragraph = Placeholder.Paragraph;

/* eslint-disable react-hooks/rules-of-hooks */
type Props = { initialState: State; user: User } & RouterProps;

function mapStateToProps(state: any) {
    return {
        user: state.userManagement && state.userManagement.user,
        isFetchingWhoAmI: state.userManagement.isFetchingWhoAmI
    };
}

function hasMetaDataCreationToolAccess(user: User) {
    return findPermissionGap(
        [
            "object/dataset/draft/read",
            "object/dataset/published/read",
            "object/dataset/draft/create",
            "object/dataset/draft/update",
            "object/dataset/published/create",
            "object/dataset/published/update"
        ],
        user
    );
}

const loadingArea = (
    <>
        <Loader center size="sm" content="loading..." />
        <Paragraph
            style={{ marginTop: 30 }}
            rows={12}
            graph="square"
            active
        ></Paragraph>
    </>
);

export default <T extends Props>(Component: React.ComponentType<T>) => {
    const withEditDatasetState = (props: T) => {
        const [state, updateData] = useState<State | undefined>(undefined);
        const missingOperations = hasMetaDataCreationToolAccess(props.user);
        const isDisabled =
            !config.featureFlags.previewAddDataset && missingOperations?.length;

        const { loading, error } = useAsync(
            async (isDisabled, datasetId, user) => {
                if (isDisabled || !datasetId) {
                    return;
                }
                resetFileUploadMarkers();
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
            [isDisabled, (props as any).match.params.datasetId, props.user]
        );

        if ((props as any).isFetchingWhoAmI) {
            return loadingArea;
        } else if (isDisabled) {
            return (
                <div
                    className="au-body au-page-alerts au-page-alerts--error"
                    style={{ marginTop: "50px" }}
                >
                    <div>
                        You need permissions of the following operations to
                        access this page:
                        <ul>
                            {missingOperations.map((operationUri, idx) => (
                                <li key={idx}>{operationUri}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            );
        } else if ((!state || loading) && !error) {
            return loadingArea;
        } else if (error) {
            return <div>Failed to load dataset data: {"" + error}</div>;
        } else {
            return <Component {...props} initialState={state} />;
        }
    };

    return connect(mapStateToProps)(withRouter(withEditDatasetState as any));
};

/* eslint-enable react-hooks/rules-of-hooks */
