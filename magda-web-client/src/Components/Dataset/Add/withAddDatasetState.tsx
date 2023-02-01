import React, { useState } from "react";
import { RouteChildrenProps, withRouter } from "react-router-dom";
import { connect } from "react-redux";

import { loadState, State } from "./DatasetAddCommon";
import { User } from "reducers/userManagementReducer";
import { config } from "config";
import { useAsync } from "react-async-hook";
import { findPermissionGap } from "helpers/accessControlUtils";
import { resetFileUploadMarkers } from "./Pages/AddFiles/uploadFile";
import Placeholder from "rsuite/Placeholder";
import Loader from "rsuite/Loader";

const Paragraph = Placeholder.Paragraph;

/* eslint-disable react-hooks/rules-of-hooks */

type Props = { initialState: State; user: User } & RouteChildrenProps<any>;

function mapStateToProps(state: any) {
    return {
        user: state.userManagement && (state.userManagement.user as User),
        isFetchingWhoAmI: state.userManagement.isFetchingWhoAmI as boolean
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
            "object/dataset/published/update",
            "object/distribution/draft/create",
            "object/distribution/draft/read",
            "object/distribution/draft/update",
            "object/distribution/published/create",
            "object/distribution/published/read",
            "object/distribution/published/update",
            "object/organization/read",
            "object/faas/function/read",
            "object/faas/function/invoke"
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

const withAddDatasetState = <T extends Props>(
    Component: React.ComponentType<T>
) => {
    const WithAddDatasetStateComp = (props: T) => {
        const missingOperations = hasMetaDataCreationToolAccess(props.user);
        const datasetId = props?.match?.params?.datasetId;
        const userId = props?.user?.id;
        const orgUnitId = props?.user?.orgUnitId;
        const isDisabled =
            !config.featureFlags.previewAddDataset && missingOperations?.length;

        const [state, updateData] = useState<State | undefined>(undefined);
        const { loading, error } = useAsync(
            async (isDisabled, datasetId, userId, orgUnitId) => {
                if (isDisabled || !datasetId) {
                    return;
                }
                const user: any = {
                    id: userId,
                    orgUnitId
                };
                resetFileUploadMarkers();
                const datasetState = await loadState(datasetId, user);
                updateData(datasetState);
            },
            [isDisabled, datasetId, userId, orgUnitId]
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

    return connect(mapStateToProps)(withRouter(WithAddDatasetStateComp as any));
};

export default withAddDatasetState;

/* eslint-enable react-hooks/rules-of-hooks */
