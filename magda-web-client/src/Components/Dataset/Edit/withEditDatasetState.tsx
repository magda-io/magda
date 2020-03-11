import React, { useEffect, useState } from "react";
import { RouterProps, withRouter } from "react-router-dom";
import { connect } from "react-redux";
import { useAsync } from "react-async-hook";
import { State, createBlankState } from "../Add/DatasetAddCommon";
import { User } from "reducers/userManagementReducer";
import { config } from "config";
import { fetchDataset } from "api-clients/RegistryApis";

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

        const { loading, error, result } = useAsync(async () => {
            if (isDisabled || !props.match.params.datasetId) {
                return undefined;
            }
            const data = await fetchDataset(props.match.params.datasetId);
            console.log(data);

            const datasetData = createBlankState();

            /* 
            export type State = {
    distributions: Distribution[];
    dataset: Dataset;
    datasetPublishing: DatasetPublishing;
    processing: boolean;
    spatialCoverage: SpatialCoverage;
    temporalCoverage: TemporalCoverage;
    datasetAccess: Access;
    informationSecurity: InformationSecurity;
    provenance: Provenance;
    currency: Currency;

    _lastModifiedDate: Date;
    _createdDate: Date;

    licenseLevel: "dataset" | "distribution";

    shouldUploadToStorageApi: boolean;

    isPublishing: boolean;
    error: Error | null;
};
            
            */

            return datasetData;
        }, [props.user, props.match.params.datasetId]);

        console.log(loading, error, result, updateData);

        useEffect(() => {
            // Once redux has finished getting a logged in user, load the state (we need to pass the current user in to populate default state)
            /*loadState(props.match.params.dataset, props.user).then(state => {
                updateData(state);
            });*/
        }, [props.user]);

        if (!state || props.isFetchingWhoAmI) {
            return <div>Loading...</div>;
        } else if (
            !config.featureFlags.previewAddDataset &&
            (!props.user || props.user.id === "" || props.user.isAdmin !== true)
        ) {
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
        } else {
            return <Component {...props} initialState={state} />;
        }
    };

    return connect(mapStateToProps)(withRouter(withEditDatasetState));
};
