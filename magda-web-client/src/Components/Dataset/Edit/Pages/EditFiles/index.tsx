import React from "react";

import DatasetFile from "Components/Dataset/Add/DatasetFile";
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
import UserVisibleError from "helpers/UserVisibleError";
import deleteDistribution from "../../../Add/Pages/AddFiles/deleteDistribution";
import updateLastModifyDate from "../../../Add/Pages/AddFiles/updateLastModifyDate";

import AddNewFilesModal from "./AddNewFilesModal";

import { ReactComponent as AddDatasetIcon } from "assets/add-dataset.svg";
import AsyncButton from "Components/Common/AsyncButton";

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

class EditFilesPage extends React.Component<Props> {
    addDistribution = (distribution: Distribution) => {
        this.props.setState((state: State) => {
            const newDistribution = state.distributions.concat(distribution);
            return {
                ...state,
                distributions: newDistribution
            };
        });
    };

    editDistribution = (distId: string) => (
        updater: (distribution: Distribution) => Distribution
    ) => {
        this.props.setState((state: State) => ({
            ...state,
            distributions: [...state.distributions].map((item) =>
                item.id === distId ? updater(item) : item
            )
        }));
        updateLastModifyDate(this.props.setState);
    };

    renderStorageOption() {
        const state = this.props.stateData;
        const localFiles = state.distributions.filter(
            (file) => file.creationSource === DistributionSource.File
        );

        return (
            <StorageOptionsSection
                files={localFiles}
                shouldUploadToStorageApi={state.shouldUploadToStorageApi}
                setShouldUploadToStorageApi={(value) => {
                    this.props.setState((state: State) => {
                        const newState = {
                            ...state,
                            shouldUploadToStorageApi: value
                        };
                        if (value) {
                            // --- delete dataset location data when upload to storage api is selected
                            const {
                                location: originalLocation,
                                ...newDatasetAccess
                            } = { ...state.datasetAccess };
                            newState.datasetAccess = newDatasetAccess;
                        }
                        return newState;
                    });
                }}
                dataAccessLocation={
                    state.datasetAccess.location
                        ? state.datasetAccess.location
                        : ""
                }
                setDataAccessLocation={(value) =>
                    this.props.setState((state: State) => ({
                        ...state,
                        datasetAccess: {
                            ...state.datasetAccess,
                            location: value
                        }
                    }))
                }
            />
        );
    }

    render() {
        const { stateData: state } = this.props;
        const comfirmedDistributions = state.distributions.filter(
            (item) => item.isComfired !== false
        );

        const uncomfirmedDistributions = state.distributions.filter(
            (item) => item.isComfired === false
        );
        console.log(uncomfirmedDistributions);

        const deleteDistributionHandler = (distId: string) => () => {
            deleteDistribution(
                this.props.datasetId,
                this.props.setState,
                this.props.stateData.shouldUploadToStorageApi,
                distId
            ).catch((e) => {
                console.error(e);
                if (e instanceof UserVisibleError) {
                    this.props.setState({
                        error: e
                    });
                }
            });
        };

        return (
            <div
                className={`container-fluid dataset-add-file-page is-edit-view`}
            >
                <div className="row add-files-heading">
                    <div className="col-xs-12">
                        <h3>Your files and distributions</h3>
                        <h4>Storage and location</h4>
                        {this.renderStorageOption()}
                    </div>
                </div>

                <h4 className="dataset-contents-heading">Dataset contents</h4>
                <div className="dataset-contents-sub-heading">
                    Existing contents:
                </div>

                <div className="row files-area">
                    <div className="col-xs-12">
                        <div className="row">
                            {comfirmedDistributions.map(
                                (file: Distribution, i) => {
                                    let isLastRow;
                                    if (comfirmedDistributions.length % 2) {
                                        isLastRow =
                                            i >=
                                            comfirmedDistributions.length - 1;
                                    } else {
                                        isLastRow =
                                            i >=
                                            comfirmedDistributions.length - 2;
                                    }
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
                                                onChange={this.editDistribution(
                                                    file.id!
                                                )}
                                                onDelete={deleteDistributionHandler(
                                                    file.id!
                                                )}
                                            />
                                        </div>
                                    );
                                }
                            )}
                        </div>

                        {state.error && (
                            <div className="au-body au-page-alerts au-page-alerts--error">
                                Failed to process file: {state.error?.message}
                            </div>
                        )}
                    </div>
                </div>

                <div className="new-files">
                    <div className="empty-new-file-hint">
                        Do you want to add or replace the contents of this
                        dataset?
                    </div>
                    <AsyncButton icon={AddDatasetIcon} isSecondary={true}>
                        Add or replace files, APIs or URLs
                    </AsyncButton>
                    <AddNewFilesModal
                        datasetId={this.props.datasetId}
                        stateData={this.props.stateData}
                        datasetStateUpdater={this.props.setState}
                    />
                </div>
            </div>
        );
    }
}

export default EditFilesPage;
