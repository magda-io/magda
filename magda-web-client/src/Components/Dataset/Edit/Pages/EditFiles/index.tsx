import React, { FunctionComponent, useState } from "react";

import DistributionItem from "Components/Dataset/Add/DistributionItem";
import StorageOptionsSection from "Components/Dataset/Add/StorageOptionsSection";

import {
    State,
    Distribution,
    DistributionSource,
    DatasetStateUpdaterType
} from "../../../Add/DatasetAddCommon";

import { User } from "reducers/userManagementReducer";

import "./index.scss";
import "../../../Add/DatasetAddCommon.scss";
import deleteDistribution from "../../../Add/Pages/AddFiles/deleteDistribution";
import updateLastModifyDate from "../../../Add/Pages/AddFiles/updateLastModifyDate";

import AddNewFilesModal from "./AddNewFilesModal";

import { ReactComponent as AddDatasetIcon } from "assets/add-dataset.svg";
import AsyncButton from "Components/Common/AsyncButton";
import DistSupercedeSection from "./DistSupercedeSection";

type Props = {
    edit: <K extends keyof State>(
        aspectField: K
    ) => (field: string) => (newValue: any) => void;
    setState: DatasetStateUpdaterType;
    user: User;
    datasetId: string;
    stateData: State;
    // --- if use as edit page
    isEditView: boolean;
};

const EditFilesPage: FunctionComponent<Props> = (props) => {
    const [isAddFilesModalOpen, setIsAddFilesModelOpen] = useState<boolean>(
        false
    );

    const editDistribution = (distId: string) => (
        updater: (distribution: Distribution) => Distribution
    ) => {
        props.setState((state: State) => ({
            ...state,
            distributions: [...state.distributions].map((item) =>
                item.id === distId ? updater(item) : item
            )
        }));
        updateLastModifyDate(props.setState);
    };

    const renderStorageOption = () => {
        const state = props.stateData;
        const localFiles = state.distributions.filter(
            (file) => file.creationSource === DistributionSource.File
        );

        return (
            <StorageOptionsSection
                files={localFiles}
                shouldUploadToStorageApi={state.datasetAccess.useStorageApi}
                setShouldUploadToStorageApi={(value) => {
                    props.setState((state: State) => {
                        const datasetAccess = { ...state.datasetAccess };

                        datasetAccess.useStorageApi = value;

                        if (value) {
                            // --- delete dataset location data when upload to storage api is selected
                            delete datasetAccess.location;
                        }

                        return {
                            ...state,
                            datasetAccess
                        };
                    });
                }}
                dataAccessLocation={
                    state.datasetAccess.location
                        ? state.datasetAccess.location
                        : ""
                }
                setDataAccessLocation={(value) =>
                    props.setState((state: State) => ({
                        ...state,
                        datasetAccess: {
                            ...state.datasetAccess,
                            location: value
                        }
                    }))
                }
            />
        );
    };

    const deleteDistributionHandler = (distId: string) => () =>
        deleteDistribution(
            props.datasetId,
            props.setState,
            props.stateData.datasetAccess.useStorageApi,
            distId
        );

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
                        return (
                            <div
                                key={i}
                                className={`col-xs-6 dataset-add-files-fileListItem ${
                                    isLastRow ? "last-row" : ""
                                }`}
                            >
                                <DistributionItem
                                    idx={i}
                                    className="small"
                                    distribution={file}
                                    onChange={editDistribution(file.id!)}
                                    onDelete={deleteDistributionHandler(
                                        file.id!
                                    )}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const render = () => {
        const { stateData: state } = props;
        // --- existing distributions or dist confirmed `adding` and `replacement`
        const existingDistributions = state.distributions.filter(
            (item) =>
                item.isReplacementComfired !== false &&
                item.isAddConfirmed !== false
        );

        const newDistributions = state.distributions.filter(
            (item) =>
                item.isAddConfirmed === true &&
                item.isReplacementComfired === false
        );

        return (
            <div
                className={`container-fluid dataset-add-file-page is-edit-view`}
            >
                <div className="row add-files-heading">
                    <div className="col-xs-12">
                        <h3>Your files and distributions</h3>
                        <h4>Storage and location</h4>
                        {renderStorageOption()}
                    </div>
                </div>

                <h4 className="dataset-contents-heading">Dataset contents</h4>
                <div className="dataset-contents-sub-heading">
                    Existing contents:
                </div>

                {existingDistributions.length ? (
                    <div className="row files-area">
                        {renderDistList(existingDistributions)}
                    </div>
                ) : null}

                {newDistributions.length ? (
                    <div className="has-new-files-area">
                        <div className="empty-new-file-hint dataset-contents-sub-heading">
                            New contents:
                        </div>
                        <AsyncButton
                            icon={AddDatasetIcon}
                            isSecondary={true}
                            onClick={() => setIsAddFilesModelOpen(true)}
                        >
                            Add or replace files, APIs or URLs
                        </AsyncButton>
                    </div>
                ) : (
                    <>
                        <div className="empty-new-file-hint">
                            Do you want to add or replace the contents of this
                            dataset?
                        </div>
                        <AsyncButton
                            icon={AddDatasetIcon}
                            isSecondary={true}
                            onClick={() => setIsAddFilesModelOpen(true)}
                        >
                            Add or replace files, APIs or URLs
                        </AsyncButton>
                    </>
                )}

                {newDistributions.length ? (
                    <div className="row new-files-area">
                        {renderDistList(newDistributions)}
                    </div>
                ) : null}

                {newDistributions.length ? (
                    <DistSupercedeSection
                        datasetId={props.datasetId}
                        stateData={props.stateData}
                        datasetStateUpdater={props.setState}
                        editDistributionHandler={editDistribution}
                        deleteDistributionHandler={deleteDistributionHandler}
                    />
                ) : null}

                <AddNewFilesModal
                    isOpen={isAddFilesModalOpen}
                    setIsOpen={setIsAddFilesModelOpen}
                    datasetId={props.datasetId}
                    stateData={props.stateData}
                    datasetStateUpdater={props.setState}
                    editDistributionHandler={editDistribution}
                    deleteDistributionHandler={deleteDistributionHandler}
                />
            </div>
        );
    };

    return render();
};

export default EditFilesPage;
