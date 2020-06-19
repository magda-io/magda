import React from "react";

import ToolTip from "Components/Dataset/Add/ToolTip";
import DatasetFile from "Components/Dataset/Add/DatasetFile";
import AddDatasetLinkSection from "Components/Dataset/Add/AddDatasetLinkSection";
import StorageOptionsSection from "Components/Dataset/Add/StorageOptionsSection";
import FileDropZone from "./FileDropZone";

import {
    State,
    Distribution,
    DistributionSource,
    DatasetStateUpdaterType
} from "../../DatasetAddCommon";

import { User } from "reducers/userManagementReducer";

import "./index.scss";
import "../../DatasetAddCommon.scss";
import UserVisibleError from "helpers/UserVisibleError";
import deleteDistribution from "./deleteDistribution";
import updateLastModifyDate from "./updateLastModifyDate";

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

class AddFilesPage extends React.Component<Props> {
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
        const { stateData: state, isEditView } = this.props;
        const localFiles = state.distributions.filter(
            (file) => file.creationSource === DistributionSource.File
        );

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
                className={`container-fluid dataset-add-file-page ${
                    isEditView ? "is-edit-view" : ""
                }`}
            >
                {isEditView ? null : (
                    <div className="row top-area-row">
                        <div className="col-xs-12 top-text-area">
                            <h1>Add your dataset to pre-populate metadata</h1>
                            <p>
                                Our Publishing Tool can review your dataset
                                contents and pre-populate metadata. Just add all
                                the files or services that make up your dataset.
                            </p>
                            <p>
                                You can upload your dataset as files, add a link
                                to files already hosted online, or add a link to
                                a web service, or any combination of the three.
                            </p>
                            <p>
                                All our processing happens in your internet
                                browser, we only store a copy of your files if
                                you ask us to, and you can edit or delete the
                                metadata at any time.
                            </p>
                            <p>
                                Want to upload your entire data catalogue in one
                                go? Use our <a>Bulk Upload tool</a>
                            </p>
                        </div>
                    </div>
                )}

                <div className="row add-files-heading">
                    <div className="col-xs-12">
                        {isEditView ? (
                            <h3>Your files and distributions</h3>
                        ) : (
                            <h3>Add files</h3>
                        )}
                        {this.renderStorageOption()}
                    </div>

                    {localFiles.length > 0 && (
                        <div className="col-xs-12 tip-area">
                            <ToolTip>
                                We recommend ensuring dataset file names are
                                descriptive so users can easily understand the
                                contents.
                            </ToolTip>
                        </div>
                    )}
                </div>

                <div className="row files-area">
                    <div className="col-xs-12">
                        <div className="row">
                            {localFiles.map((file: Distribution, i) => {
                                let isLastRow;
                                if (localFiles.length % 2) {
                                    isLastRow = i >= localFiles.length - 1;
                                } else {
                                    isLastRow = i >= localFiles.length - 2;
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
                            })}
                        </div>

                        {state.error && (
                            <div className="au-body au-page-alerts au-page-alerts--error">
                                Failed to process file: {state.error?.message}
                            </div>
                        )}

                        {localFiles.length > 0 && (
                            <div className="more-files-to-add-text">
                                More files to add?
                            </div>
                        )}
                    </div>
                </div>

                <FileDropZone
                    datasetId={this.props.datasetId}
                    datasetStateUpdater={this.props.setState}
                    stateData={this.props.stateData}
                />

                <AddDatasetLinkSection
                    type={DistributionSource.DatasetUrl}
                    distributions={state.distributions}
                    addDistribution={this.addDistribution}
                    editDistribution={this.editDistribution}
                    deleteDistribution={deleteDistributionHandler}
                    setMetadataState={this.props.setState}
                />

                <AddDatasetLinkSection
                    type={DistributionSource.Api}
                    distributions={state.distributions}
                    addDistribution={this.addDistribution}
                    editDistribution={this.editDistribution}
                    deleteDistribution={deleteDistributionHandler}
                    setMetadataState={this.props.setState}
                />
            </div>
        );
    }
}

export default AddFilesPage;
