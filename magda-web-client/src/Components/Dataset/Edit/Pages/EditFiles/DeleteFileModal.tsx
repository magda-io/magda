import React, { FunctionComponent, useState, useCallback } from "react";
import OverlayBox from "Components/Common/OverlayBox";
import AsyncButton from "Components/Common/AsyncButton";
import {
    State,
    DatasetStateUpdaterType,
    saveRuntimeStateToStorage
} from "Components/Dataset/Add/DatasetAddCommon";

import ErrorMessageBox from "Components/Common/ErrorMessageBox";

import "./DeleteFileModal.scss";
import ToolTip from "Components/Dataset/Add/ToolTip";
import DistributionItem from "Components/Dataset/Add/DistributionItem";
import promisifySetState from "helpers/promisifySetState";
import unknown2Error from "@magda/typescript-common/dist/unknown2Error";

type PropsType = {
    datasetId: string;
    distId?: string;
    stateData: State;
    datasetStateUpdater: DatasetStateUpdaterType;
    isOpen: boolean;
    closeModal: () => void;
};

/**
 *  This modal is for comfirming the deletion of an existing distribution during an editing dataset workflow.
 *  For deleting a new file / distribution, we don't need to show this as a new file (before confirmed) can not be superceded.
 */
const DeleteFileModal: FunctionComponent<PropsType> = (props) => {
    const { datasetStateUpdater, datasetId, distId, closeModal } = props;
    const [error, setError] = useState<Error | null>(null);
    const targetDist = props.stateData.distributions.find(
        (item) => item.id === props.distId
    );

    const onDeleteClick = useCallback(async () => {
        try {
            setError(null);

            if (!targetDist) {
                throw new Error(
                    "Cannot locate distribution data by ID: " + distId
                );
            }

            // --- we won't attempt to delete the actually file from storage API now (because user has not submitted yet)
            // --- all deleted files will be all removed when submit
            await promisifySetState(datasetStateUpdater)((state) => ({
                ...state,
                distributions: state.distributions.filter(
                    (item) => item.id !== distId
                )
            }));

            await saveRuntimeStateToStorage(datasetId, datasetStateUpdater);

            closeModal();
        } catch (e) {
            setError(unknown2Error(e));
        }
    }, [
        datasetStateUpdater,
        datasetId,
        distId,
        setError,
        closeModal,
        targetDist
    ]);

    if (!props.isOpen || !props.distId) {
        return null;
    }

    return (
        <OverlayBox
            className="distribution-deletion-confirmation-modal"
            isOpen={props.isOpen}
            title="Delete files?"
            onClose={props.closeModal}
        >
            <div className="content-area">
                <div className="inner-content-area">
                    <h3>
                        Are you sure you want to delete the following file
                        (distribution)?
                    </h3>

                    <ToolTip>
                        Deleting a file will remove it from the list of files
                        (distributions) visible against a dataset. If you want
                        to supercede or replace an old file (distribution) with
                        a newer one, use the Add or Replace function instead to
                        ensure your file (distribution) history is retained and
                        visible.
                    </ToolTip>

                    <DistributionItem
                        distribution={
                            props.stateData.distributions.find(
                                (item) => item.id === props.distId
                            )!
                        }
                    />
                </div>

                <ErrorMessageBox error={error} />

                <div className="bottom-button-area">
                    <div>
                        <AsyncButton onClick={onDeleteClick}>
                            Yes, delete it{" "}
                        </AsyncButton>{" "}
                        <AsyncButton
                            isSecondary={true}
                            onClick={props.closeModal}
                        >
                            No, cancel
                        </AsyncButton>
                    </div>
                </div>
            </div>
        </OverlayBox>
    );
};

export default DeleteFileModal;
