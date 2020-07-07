import React, {
    FunctionComponent,
    useState,
    useCallback,
    useEffect
} from "react";
import { connect } from "react-redux";
import { User } from "reducers/userManagementReducer";
import OverlayBox from "Components/Common/OverlayBox";
import AsyncButton from "Components/Common/AsyncButton";
import {
    State,
    DatasetStateUpdaterType,
    cleanUpOrphanFiles
} from "Components/Dataset/Add/DatasetAddCommon";
import moment from "moment";
import ErrorMessageBox from "Components/Common/ErrorMessageBox";

import "./ConfirmLoadPreviousChanges.scss";
import FileDeletionError from "helpers/FileDeletionError";
import promisifySetState from "helpers/promisifySetState";
import { deleteRecordAspect } from "api-clients/RegistryApis";

type PropsType = {
    user: User;
    datasetId: string;
    stateData: State;
    datasetStateUpdater: DatasetStateUpdaterType;
};

const ConfirmLoadPreviousChanges: FunctionComponent<PropsType> = (props) => {
    const [error, setError] = useState<Error | null>(null);
    const [draftData, setDraftData] = useState<State | null>(null);
    const { datasetStateUpdater } = props;
    const datasetDraftData = props?.stateData?.datasetDraft?.data;
    const userId = props?.user?.id;
    const uploadedFileUrls = draftData?.uploadedFileUrls;

    useEffect(() => {
        try {
            setError(null);
            if (!datasetDraftData || !userId) {
                setDraftData(null);
            } else {
                const recoverData = JSON.parse(datasetDraftData) as State;
                recoverData.dataset.editingUserId = userId;
                setDraftData(recoverData ? recoverData : null);
                return;
            }
        } catch (e) {
            setError(e);
            setDraftData(null);
        }
    }, [datasetDraftData, userId, setDraftData]);

    const onRecover = useCallback(() => {
        // --- load saved draft state data
        datasetStateUpdater(draftData!);
        // --- set draft data to null to close modal
        setDraftData(null);
    }, [draftData, setDraftData, datasetStateUpdater]);

    const onDiscard = useCallback(async () => {
        try {
            setError(null);
            if (uploadedFileUrls?.length) {
                /**
                 * clean Up OrphanFiles by compare saved unsubmitted state and submitted (registry) state
                 */
                const result = await cleanUpOrphanFiles(
                    uploadedFileUrls,
                    props.stateData.distributions
                );

                if (result.length) {
                    throw new FileDeletionError(result);
                }
            }

            // --- delete the draft so it won't show up again
            await deleteRecordAspect(props.datasetId, "dataset-draft");

            // --- remove dataset draft data from the local state
            await promisifySetState(props.datasetStateUpdater)((state) => ({
                ...state,
                datasetDraft: undefined
            }));

            // --- set draft data to null to close modal
            setDraftData(null);
        } catch (e) {
            setError(e);
        }
    }, [
        uploadedFileUrls,
        props.stateData.distributions,
        props.datasetId,
        props.datasetStateUpdater
    ]);

    if (!draftData || !props?.user) {
        return null;
    }

    return (
        <OverlayBox
            className="confirm-load-previous-changes-modal"
            isOpen={draftData ? true : false}
            title="Do you want to recover previously saved unsubmitted changes or discard it?"
            showCloseButton={false}
        >
            <div className="content-area">
                <div className="au-body au-page-alerts au-page-alerts--info">
                    <h3>Found previously unsubmitted changes</h3>
                    <p>
                        System found previously auto-saved unsubmitted changes
                        for this dataset (saved on{" "}
                        {moment(props.stateData.datasetDraft?.timestamp).format(
                            "dddd, Do MMMM YYYY, h:mm:ss a"
                        )}
                        ).
                    </p>
                    <p>
                        Do you want to load &amp; recover the previous
                        unsubmitted changes or discard previous changes?
                    </p>
                </div>

                <ErrorMessageBox error={error} />

                <div className="bottom-button-area">
                    <div>
                        <AsyncButton onClick={onRecover}>
                            Recover Previous Changes
                        </AsyncButton>{" "}
                        &nbsp;&nbsp;&nbsp;
                        <AsyncButton isSecondary={true} onClick={onDiscard}>
                            Discard Previous Changes
                        </AsyncButton>
                    </div>
                </div>
            </div>
        </OverlayBox>
    );
};

function mapStateToProps(state: any) {
    return {
        user: state.userManagement && (state.userManagement.user as User)
    };
}

export default connect(mapStateToProps)(ConfirmLoadPreviousChanges);
