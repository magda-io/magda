import React, { FunctionComponent, useRef, useState } from "react";
import OverlayBox from "Components/Common/OverlayBox";
import FileDropZone from "../../../Add/Pages/AddFiles/FileDropZone";
import {
    State,
    DatasetStateUpdaterType,
    Distribution,
    DistributionSource,
    DistributionState
} from "Components/Dataset/Add/DatasetAddCommon";
import AsyncButton from "Components/Common/AsyncButton";
import DatasetFile from "Components/Dataset/Add/DatasetFile";
import AddDatasetFromLinkInput from "../../../Add/Pages/AddFiles/AddDatasetFromLinkInput";
import DatasetLinkItem from "Components/Dataset/Add/DatasetLinkItem";

import "./AddNewFilesModal.scss";

type PropsType = {
    stateData: State;
    datasetStateUpdater: DatasetStateUpdaterType;
    datasetId: string;
    deleteDistributionHandler: (dist: string) => () => Promise<void>;
    editDistributionHandler: (
        distId: string
    ) => (updater: (distribution: Distribution) => Distribution) => void;
    isOpen: boolean;
    setIsOpen: (boolean) => void;
};

type PromiseListType = {
    (key: string): Promise<void>;
};

const AddNewFilesModal: FunctionComponent<PropsType> = (props) => {
    const { distributions } = props.stateData;
    const [error, setError] = useState<Error | null>(null);
    const [processingErrorMessage, setProcessingErrorMessage] = useState("");
    const deletionPromisesRef = useRef<PromiseListType>({} as PromiseListType);

    const renderDistList = (
        dists: Distribution[],
        isUrlItem: boolean = false
    ) => {
        return (
            <div className="col-xs-12">
                <div className="row">
                    {dists.map((file: Distribution, i) => {
                        let isLastRow;
                        if (dists.length % 2) {
                            isLastRow = i >= dists.length - 1;
                        } else {
                            isLastRow = i >= dists.length - 2;
                        }

                        const distId = file.id!;

                        const delHandler = async () => {
                            const deletionPromises =
                                deletionPromisesRef.current;
                            try {
                                setError(null);
                                deletionPromises[
                                    distId
                                ] = props.deleteDistributionHandler(distId)();
                                await deletionPromises[distId];
                            } catch (e) {
                                setError(e);
                                throw e;
                            }
                        };

                        return (
                            <div
                                key={i}
                                className={`col-xs-6 dataset-add-files-fileListItem ${
                                    isLastRow ? "last-row" : ""
                                }`}
                            >
                                {isUrlItem ? (
                                    <DatasetLinkItem
                                        idx={i}
                                        key={i}
                                        distribution={file}
                                        datasetStateUpdater={
                                            props.datasetStateUpdater
                                        }
                                    />
                                ) : (
                                    <DatasetFile
                                        idx={i}
                                        key={i}
                                        file={file}
                                        onChange={props.editDistributionHandler(
                                            file.id!
                                        )}
                                        onDelete={delHandler}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const uploadedDistributions = distributions.filter(
        (item) =>
            item.isAddConfirmed === false &&
            item.creationSource === DistributionSource.File
    );

    const urlDistributions = distributions.filter(
        (item) =>
            item.isAddConfirmed === false &&
            (item.creationSource === DistributionSource.Api ||
                item.creationSource === DistributionSource.DatasetUrl)
    );

    const pendingDistributions = distributions.filter(
        (item) =>
            item._state !== DistributionState.Ready &&
            item._state !== DistributionState.Drafting
    );

    const closeModal = async () => {
        try {
            setError(null);
            const deletionPromises = deletionPromisesRef.current;
            // --- wait for existing deletion job
            await Promise.all(Object.values(deletionPromises));
            // --- try to delete all existing files
            await Promise.all(
                uploadedDistributions.map((item) =>
                    props.deleteDistributionHandler(item.id!)()
                )
            );
            // -- try to delete all existing url distributions
            await Promise.all(
                urlDistributions.map((item) =>
                    props.deleteDistributionHandler(item.id!)()
                )
            );
            props.setIsOpen(false);
        } catch (e) {
            setError(e);
        }
    };

    return (
        <OverlayBox
            className="add-new-files-modal"
            isOpen={props.isOpen}
            title="Select the new content you want to add or replace"
            onClose={closeModal}
            showCloseButton={pendingDistributions.length ? false : true}
        >
            <div className="content-area">
                <div className="small-heading">New files</div>

                {uploadedDistributions.length ? (
                    <div className="file-items-area">
                        {renderDistList(uploadedDistributions)}
                    </div>
                ) : null}

                <div className="cols-sm-12 file-drop-area">
                    <FileDropZone
                        stateData={props.stateData}
                        datasetId={props.datasetId}
                        datasetStateUpdater={props.datasetStateUpdater}
                        initDistProps={{
                            isAddConfirmed: false,
                            isReplacementComfired: false
                        }}
                        onError={(e) => {
                            console.error(e);
                            setError(e);
                        }}
                    />
                </div>

                <div className="small-heading">
                    (and/or) New URL of an API or dataset online
                </div>

                {processingErrorMessage ? (
                    <div className="process-url-error-message au-body au-page-alerts au-page-alerts--warning">
                        <h3>{processingErrorMessage}</h3>
                        <div className="heading">Here’s what you can do:</div>
                        <ul>
                            <li>
                                Double check the URL below is correct and
                                without any typos. If you need to edit the URL,
                                do so below and press ‘Fetch’ again
                            </li>
                            <li>
                                If the URL looks correct, it’s possible we can’t
                                connect to the service or extract any meaningful
                                metadata from it. You may want to try again
                                later
                            </li>
                            <li>
                                If you want to continue using this URL you can,
                                however you’ll need to manually enter the
                                dataset metadata. Use the ‘Manually enter
                                metadata’ button below
                            </li>
                        </ul>
                    </div>
                ) : null}

                <AddDatasetFromLinkInput
                    initDistProps={{
                        isAddConfirmed: false,
                        isReplacementComfired: false
                    }}
                    datasetStateUpdater={props.datasetStateUpdater}
                    onProcessingError={(e) => {
                        setProcessingErrorMessage(
                            "" + (e.message ? e.message : e)
                        );
                    }}
                    onClearProcessingError={() => setProcessingErrorMessage("")}
                />

                {urlDistributions.length ? (
                    <div className="url-items-area">
                        {renderDistList(urlDistributions, true)}
                    </div>
                ) : null}

                {error ? (
                    <div className="au-body au-page-alerts au-page-alerts--error">
                        <div>
                            <span>
                                Magda has encountered an error: {error?.message}
                            </span>
                        </div>
                    </div>
                ) : null}
            </div>

            <div className="bottom-button-area">
                <AsyncButton
                    disabled={pendingDistributions.length ? true : false}
                    onClick={() => {
                        [...uploadedDistributions, ...urlDistributions].forEach(
                            (item) => {
                                props.editDistributionHandler(item.id!)(
                                    (dist) => ({
                                        ...dist,
                                        isAddConfirmed: true
                                    })
                                );
                            }
                        );
                        props.setIsOpen(false);
                    }}
                >
                    Finish Adding
                </AsyncButton>{" "}
                &nbsp;&nbsp;&nbsp;
                <AsyncButton
                    isSecondary={true}
                    onClick={closeModal}
                    disabled={pendingDistributions.length ? true : false}
                >
                    Cancel
                </AsyncButton>
            </div>
        </OverlayBox>
    );
};

export default AddNewFilesModal;
