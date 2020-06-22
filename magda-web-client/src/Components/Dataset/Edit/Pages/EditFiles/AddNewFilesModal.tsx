import React, { FunctionComponent } from "react";
import OverlayBox from "Components/Common/OverlayBox";
import FileDropZone from "../../../Add/Pages/AddFiles/FileDropZone";
import {
    State,
    DatasetStateUpdaterType,
    Distribution,
    DistributionSource
} from "Components/Dataset/Add/DatasetAddCommon";
import AsyncButton from "Components/Common/AsyncButton";
import DatasetFile from "Components/Dataset/Add/DatasetFile";

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

const AddNewFilesModal: FunctionComponent<PropsType> = (props) => {
    const { distributions } = props.stateData;
    const deletionPromises = {} as {
        (distId: string): Promise<void>;
    };

    const renderDistList = (dists: Distribution[]) => {
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

                        const delHandler = () => {
                            deletionPromises[
                                distId
                            ] = props.deleteDistributionHandler(distId)();
                            return deletionPromises[distId];
                        };

                        return (
                            <div
                                key={i}
                                className={`col-xs-6 dataset-add-files-fileListItem ${
                                    isLastRow ? "last-row" : ""
                                }`}
                            >
                                <DatasetFile
                                    idx={i}
                                    file={file}
                                    onChange={props.editDistributionHandler(
                                        file.id!
                                    )}
                                    onDelete={delHandler}
                                />
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

    const closeModal = async () => {
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
    };

    return (
        <OverlayBox
            className="add-new-files-modal"
            isOpen={props.isOpen}
            title="Select the new content you want to add or replace"
            onClose={closeModal}
        >
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
                />
            </div>

            <div className="small-heading">
                (and/or) New URL of an API or dataset online
            </div>

            {urlDistributions.length ? (
                <div className="url-items-area">
                    {renderDistList(urlDistributions)}
                </div>
            ) : null}

            <div className="bottom-button-area">
                <AsyncButton
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
                <AsyncButton isSecondary={true} onClick={closeModal}>
                    Cancel
                </AsyncButton>
            </div>
        </OverlayBox>
    );
};

export default AddNewFilesModal;
