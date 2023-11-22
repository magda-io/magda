import React from "react";

import ToolTip from "Components/Dataset/Add/ToolTip";
import DatasetFile from "Components/Dataset/Add/DatasetFile";
import AddDatasetLinkSection from "./AddDatasetLinkSection";
import StorageOptionsSection from "Components/Dataset/Add/StorageOptionsSection";
import FileDropZone from "./FileDropZone";

import {
    State,
    createId,
    Distribution,
    DistributionSource,
    DistributionCreationMethod,
    DistributionState,
    DatasetStateUpdaterType,
    saveRuntimeStateToStorage
} from "../../DatasetAddCommon";

import { User } from "reducers/userManagementReducer";

import "./index.scss";
import "../../DatasetAddCommon.scss";
import UserVisibleError from "helpers/UserVisibleError";
import deleteDistribution from "./deleteDistribution";
import updateLastModifyDate from "./updateLastModifyDate";
import ErrorMessageBox from "Components/Common/ErrorMessageBox";
import mergeDistTitle from "Components/Dataset/MergeMetadata/mergeDistTitle";
import mergeDistKeywords from "Components/Dataset/MergeMetadata/mergeDistKeywords";
import mergeDistThemes from "Components/Dataset/MergeMetadata/mergeDistThemes";
import mergeDistIssueDate from "Components/Dataset/MergeMetadata/mergeDistIssueDate";
import mergeDistModifiedDate from "Components/Dataset/MergeMetadata/mergeDistModifiedDate";
import mergeDistSpatialCoverage from "Components/Dataset/MergeMetadata/mergeDistSpatialCoverage";
import mergeDistTemporalCoverage from "Components/Dataset/MergeMetadata/mergeDistTemporalCoverage";
import promisifySetState from "helpers/promisifySetState";
import unknown2Error from "@magda/typescript-common/dist/unknown2Error";

type Props = {
    edit: <K extends keyof State>(
        aspectField: K
    ) => (field: string) => (newValue: any) => void;
    setState: DatasetStateUpdaterType;
    user: User;
    datasetId: string;
    stateData: State;
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
                shouldUploadToStorageApi={state.datasetAccess.useStorageApi}
                setShouldUploadToStorageApi={(value) => {
                    this.props.setState((state: State) => {
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

    updateDatasetWithDistributions = async () => {
        try {
            await promisifySetState(this.props.setState)((state: State) => {
                const {
                    distributions: dists,
                    dataset,
                    temporalCoverage: datasetTemporalCoverage,
                    spatialCoverage: datasetSpatialCoverage
                } = state;

                const newKeywords = mergeDistKeywords(dists, dataset.keywords);

                const newState: State = {
                    ...state,
                    dataset: {
                        ...state.dataset,
                        title: mergeDistTitle(dists, dataset.title)!,
                        keywords: newKeywords,
                        themes: mergeDistThemes(
                            dists,
                            dataset.themes,
                            newKeywords
                        ),
                        issued: mergeDistIssueDate(dists, dataset.issued),
                        modified: mergeDistModifiedDate(dists, dataset.modified)
                    },
                    spatialCoverage: mergeDistSpatialCoverage(
                        dists,
                        datasetSpatialCoverage
                    )!,
                    temporalCoverage: mergeDistTemporalCoverage(
                        dists,
                        datasetTemporalCoverage
                    )!
                };
                return newState;
            });

            if (this.props.stateData.datasetAccess.useStorageApi) {
                // --- auto save draft after the metadata of the file is process and merged into dataset
                await saveRuntimeStateToStorage(
                    this.props.datasetId,
                    this.props.setState
                );
            }
        } catch (e) {
            console.error(e);
            this.props.setState((state) => ({
                ...state,
                error: unknown2Error(e)
            }));
        }
    };

    manualCreateFile() {
        this.props.setState((state) => ({ ...state, error: null }));
        try {
            if (
                this.props.stateData.distributions.findIndex(
                    (item) => item._state === DistributionState.Drafting
                ) !== -1
            ) {
                throw new Error(
                    "Please complete the current editing item before create a new one."
                );
            }
            const dist = {
                id: createId("dist"),
                creationSource: DistributionSource.File,
                creationMethod: DistributionCreationMethod.Manual,
                title: "Untitled",
                modified: new Date(),
                format: "",
                license: "No License",
                _state: DistributionState.Drafting,
                useStorageApi: false
            };

            this.addDistribution(dist);
        } catch (e) {
            console.error(e);
            this.props.setState((state) => ({
                ...state,
                error: unknown2Error(e)
            }));
        }
    }

    render() {
        const { stateData: state } = this.props;
        const localFiles = state.distributions.filter(
            (file) => file.creationSource === DistributionSource.File
        );

        const deleteDistributionHandler = (distId: string) => () => {
            deleteDistribution(
                this.props.datasetId,
                this.props.setState,
                this.props.stateData.datasetAccess.useStorageApi,
                distId
            ).catch((e) => {
                console.error(e);
                if (e instanceof UserVisibleError) {
                    this.props.setState((state) => ({ ...state, error: e }));
                }
            });
        };

        return (
            <div className={"container-fluid dataset-add-file-page"}>
                <div className="row top-area-row">
                    <div className="col-xs-12 top-text-area">
                        <h1>Your files and distributions</h1>
                    </div>
                </div>

                <div className="row add-files-heading">
                    <div className="col-xs-12">
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
                                            distribution={file}
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

                        <ErrorMessageBox error={state.error} />

                        {localFiles.length > 0 ? (
                            <div className="more-files-to-add-text">
                                More files to add?
                                <button
                                    className="au-btn au-btn--secondary manual-create-file-button"
                                    onClick={() => this.manualCreateFile()}
                                >
                                    Manually Create File
                                </button>
                            </div>
                        ) : (
                            <button
                                className="au-btn au-btn--secondary manual-create-file-button"
                                onClick={() => this.manualCreateFile()}
                            >
                                Manually Create File
                            </button>
                        )}
                    </div>
                </div>

                <FileDropZone
                    datasetId={this.props.datasetId}
                    datasetStateUpdater={this.props.setState}
                    stateData={this.props.stateData}
                    onError={(e) => {
                        console.error(e);
                        if (e instanceof UserVisibleError) {
                            this.props.setState((state) => ({
                                ...state,
                                error: e
                            }));
                        }
                    }}
                    onFilesProcessed={this.updateDatasetWithDistributions}
                />

                <AddDatasetLinkSection
                    distributions={state.distributions}
                    datasetStateUpdater={this.props.setState}
                    onProcessingComplete={this.updateDatasetWithDistributions}
                />
            </div>
        );
    }
}

export default AddFilesPage;
