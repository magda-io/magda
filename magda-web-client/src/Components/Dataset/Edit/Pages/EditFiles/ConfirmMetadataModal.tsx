import React, { FunctionComponent, useState, useCallback } from "react";
import OverlayBox from "Components/Common/OverlayBox";
import AsyncButton from "Components/Common/AsyncButton";
import {
    State,
    DatasetStateUpdaterType,
    SpatialCoverage,
    TemporalCoverage,
    Distribution,
    saveRuntimeStateToStorage
} from "Components/Dataset/Add/DatasetAddCommon";
import { VersionItem } from "api-clients/RegistryApis";
import Tooltip from "Components/Dataset/Add/ToolTip";
import TwoOptionsButton from "Components/Common/TwoOptionsButton";
import moment from "moment";
import SpatialDataPreviewer from "Components/Dataset/Add/SpatialAreaInput/SpatialDataPreviewer";
import promisifySetState from "helpers/promisifySetState";
import ErrorMessageBox from "Components/Common/ErrorMessageBox";
import mergeDistTitle from "Components/Dataset/MergeMetadata/mergeDistTitle";
import mergeDistIssueDate from "Components/Dataset/MergeMetadata/mergeDistIssueDate";
import mergeDistModifiedDate from "Components/Dataset/MergeMetadata/mergeDistModifiedDate";
import mergeDistKeywords from "Components/Dataset/MergeMetadata/mergeDistKeywords";
import mergeDistSpatialCoverage from "Components/Dataset/MergeMetadata/mergeDistSpatialCoverage";
import mergeDistTemporalCoverage, {
    isEmptyOrInvalidTemporalIntervals
} from "Components/Dataset/MergeMetadata/mergeDistTemporalCoverage";

import "./ConfirmMetadataModal.scss";

type PropsType = {
    datasetId: string;
    isOpen: boolean;
    setIsOpen: (boolean) => void;
    stateData: State;
    datasetStateUpdater: DatasetStateUpdaterType;
    afterClose?: () => void;
    setIsSelectedConfirmed: (boolean) => void;
};

function renderKeywordItem(keyword: string, idx: number) {
    return (
        <div className="keyword-item" key={idx}>
            {keyword}
        </div>
    );
}

function renderBBox(spatialCoverage?: SpatialCoverage) {
    if (spatialCoverage?.bbox?.length !== 4) {
        return "N/A";
    }

    const bbox = spatialCoverage.bbox;
    return (
        <div className="spatial-coverage-info-area">
            <div className="spatial-coverage-info-row">
                North bounding latitude: {bbox[3]}
            </div>
            <div className="spatial-coverage-info-row">
                West bounding latitude: {bbox[0]}
            </div>
            <div className="spatial-coverage-info-row">
                East bounding latitude: {bbox[2]}
            </div>
            <div className="spatial-coverage-info-row">
                South bounding latitude: {bbox[1]}
            </div>
            <div className="spatial-coverage-map">
                <SpatialDataPreviewer
                    bbox={{
                        west: bbox[0],
                        south: bbox[1],
                        east: bbox[2],
                        north: bbox[3]
                    }}
                    animate={false}
                />
            </div>
        </div>
    );
}

const date2Text = (d: Date | undefined) =>
    d ? moment(d).format("DD/MM/YYYY") : "N/A";

function renderTemporalCoverage(temporalCoverage?: TemporalCoverage) {
    if (isEmptyOrInvalidTemporalIntervals(temporalCoverage?.intervals)) {
        return "N/A";
    }
    return (
        <div className="temporal-coverage-info-area">
            {temporalCoverage!.intervals.map((item, idx) => (
                <div key={idx} className="temporal-coverage-info-row">
                    From: {date2Text(item.start)}
                    &nbsp;To: {date2Text(item.end)}
                </div>
            ))}
        </div>
    );
}

const ConfirmMetadataModal: FunctionComponent<PropsType> = (props) => {
    const {
        stateData,
        datasetId,
        setIsOpen,
        datasetStateUpdater,
        setIsSelectedConfirmed
    } = props;

    const [error, setErrors] = useState<Error | null>(null);

    const newDists = stateData.distributions.filter(
        (item) => item.isReplacementComfired === false
    );

    const newTitle = mergeDistTitle(newDists);
    const newIssueDate = mergeDistIssueDate(newDists);
    const newModifiedDate = mergeDistModifiedDate(newDists);
    const newKeywords = mergeDistKeywords(newDists);
    const newSpatialExtent = mergeDistSpatialCoverage(newDists);
    const newTemporalCoverage = mergeDistTemporalCoverage(newDists);

    // --- by default, replace is checked if there is new data available
    const [keepTitle, setKeepTitle] = useState<boolean>(
        newTitle ? false : true
    );
    const [keepIssueDate, setKeepIssueDate] = useState<boolean>(
        newIssueDate ? false : true
    );
    const [keepModifiedDate, setKeepModifiedDate] = useState<boolean>(
        newModifiedDate ? false : true
    );
    const [keepKeywords, setKeepKeywords] = useState<boolean>(
        newKeywords ? false : true
    );
    const [keepSpatialExtent, setKeepSpatialExtent] = useState<boolean>(
        newSpatialExtent ? false : true
    );
    const [keepTemporalCoverage, setKeepTemporalCoverage] = useState<boolean>(
        newTemporalCoverage ? false : true
    );

    const onConfirmClick = useCallback(async () => {
        setErrors(null);

        try {
            await promisifySetState(datasetStateUpdater)((state) => {
                const newState = { ...state };

                if (!keepTitle && newTitle) {
                    newState.dataset.title = newTitle;
                }

                if (!keepIssueDate && newIssueDate) {
                    newState.dataset.issued = newIssueDate;
                }

                if (!keepModifiedDate && newModifiedDate) {
                    newState.dataset.modified = newModifiedDate;
                }

                if (!keepKeywords && newKeywords) {
                    newState.dataset.keywords = newKeywords;
                }

                if (!keepSpatialExtent && newSpatialExtent) {
                    newState.spatialCoverage = newSpatialExtent;
                }

                if (!keepTemporalCoverage && newTemporalCoverage) {
                    newState.temporalCoverage = newTemporalCoverage;
                }
                // --- a list new dists that has been selected to replace old ones
                const replacedDists: Distribution[] = [];
                newState.distributions = newState.distributions
                    .map((item) => {
                        if (item.isReplacementComfired !== false) {
                            return item;
                        }
                        if (item.replaceDistId) {
                            replacedDists.push(item);
                        }
                        const newDist: Distribution = {
                            ...item,
                            isAddConfirmed: true,
                            isReplacementComfired: true
                        };
                        return newDist;
                    })
                    // --- remove the new dists that are set to replace old ones
                    .filter((item) => !item.replaceDistId)
                    .map((item) => {
                        const replaceDist = replacedDists.find(
                            (replaceDist) =>
                                replaceDist.replaceDistId === item.id
                        );
                        if (!replaceDist) {
                            // --- this dist is not subject to replacement
                            return item;
                        } else {
                            // --- replace the distribution and make a new version (only if it's already versioned)
                            let newItem = { ...item };
                            if (newItem?.version?.versions?.length) {
                                // --- the version data is valid then bump version
                                const newVersion: VersionItem = {
                                    versionNumber:
                                        1 + newItem.version.currentVersion,
                                    createTime: new Date().toISOString(),
                                    description:
                                        "Replaced superseded by a new distribution"
                                };

                                newItem.version.currentVersion =
                                    newVersion.versionNumber;
                                newItem.version.versions = [
                                    ...newItem.version.versions,
                                    newVersion
                                ];
                            }

                            const {
                                version,
                                id,
                                replaceDistId,
                                ...restReplaceDistData
                            } = replaceDist;

                            // --- replace existing item with new data
                            // --- newItem.downloadURL will be replaced with restReplaceDistData.downloadURL
                            // --- as we currently set `Record-ID` of the uploaded object to datasetId, the downloadURL will work probably after we copy it to newItem.
                            // --- we don't need to delete the file (that is replaced). Any orphan files will be deleted upon submit.
                            // --- we also don't want to delete them now so that the user can change their mind.
                            return {
                                ...newItem,
                                ...restReplaceDistData,
                                isAddConfirmed: true,
                                isReplacementComfired: true
                            };
                        }
                    });
                return newState;
            });
            // --- save to draft
            await saveRuntimeStateToStorage(datasetId, datasetStateUpdater);
        } catch (e) {
            setErrors(e);
        }

        setIsOpen(false);
        setIsSelectedConfirmed(true);
    }, [
        datasetId,
        setIsOpen,
        setIsSelectedConfirmed,
        datasetStateUpdater,
        keepTitle,
        keepIssueDate,
        keepModifiedDate,
        keepKeywords,
        keepSpatialExtent,
        keepTemporalCoverage,
        newIssueDate,
        newKeywords,
        newModifiedDate,
        newSpatialExtent,
        newTemporalCoverage,
        newTitle
    ]);

    const onCancel = useCallback(() => {
        setIsOpen(false);
        setIsSelectedConfirmed(false);
    }, [setIsSelectedConfirmed, setIsOpen]);

    if (!props.isOpen) {
        return null;
    }

    return (
        <OverlayBox
            className="confirm-metadata-modal"
            isOpen={props.isOpen}
            title="Replace the existing automated metadata fields?"
            onClose={onCancel}
            onAfterClose={props.afterClose}
        >
            <div className="content-area">
                <div className="inner-content-area">
                    <ErrorMessageBox error={error} scrollIntoView={true} />

                    <Tooltip>
                        You’ve selected to replace the dataset existing content
                        (files and/or API’s) with new content. Some of the
                        metadata we automatically generate for you might change,
                        such as the dataset title, keywords, spatial extent,
                        temporal coverage and creation date. Here you can decide
                        if you want to keep the existing metadata, or replace it
                        with the new, automatically generated metadata.
                    </Tooltip>

                    <div className="metadata-table-area">
                        <table className="metadata-table">
                            <thead>
                                <tr>
                                    <th>Field</th>
                                    <th>Existing metadata entry</th>
                                    <th>New metadata entry</th>
                                    <th>Keep or replace?</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Dataset title</td>
                                    <td>{stateData.dataset.title}</td>
                                    <td>{newTitle ? newTitle : "N/A"}</td>
                                    <td>
                                        <TwoOptionsButton
                                            disabled={newTitle ? false : true}
                                            value={keepTitle}
                                            onChange={(v) => setKeepTitle(v)}
                                            yesLabel={"Keep"}
                                            noLabel={"Replace"}
                                            ariaLabelledby="Whether or not to replace dataset title"
                                        />
                                    </td>
                                </tr>
                                <tr>
                                    <td>Dataset publication / issue date</td>
                                    <td>
                                        {stateData.dataset.issued
                                            ? moment(
                                                  stateData.dataset.issued
                                              ).format("DD/MM/YYYY")
                                            : "N/A"}
                                    </td>
                                    <td>
                                        {newIssueDate
                                            ? moment(newIssueDate).format(
                                                  "DD/MM/YYYY"
                                              )
                                            : "N/A"}
                                    </td>
                                    <td>
                                        <TwoOptionsButton
                                            disabled={
                                                newIssueDate ? false : true
                                            }
                                            value={keepIssueDate}
                                            onChange={(v) =>
                                                setKeepIssueDate(v)
                                            }
                                            yesLabel={"Keep"}
                                            noLabel={"Replace"}
                                            ariaLabelledby="Whether or not to replace dataset publication / issue date"
                                        />
                                    </td>
                                </tr>
                                <tr>
                                    <td>Last modified date</td>
                                    <td>
                                        {stateData.dataset.issued
                                            ? moment(
                                                  stateData.dataset.modified
                                              ).format("DD/MM/YYYY")
                                            : "N/A"}
                                    </td>
                                    <td>
                                        {newModifiedDate
                                            ? moment(newModifiedDate).format(
                                                  "DD/MM/YYYY"
                                              )
                                            : "N/A"}
                                    </td>
                                    <td>
                                        <TwoOptionsButton
                                            disabled={
                                                newModifiedDate ? false : true
                                            }
                                            value={keepModifiedDate}
                                            onChange={(v) =>
                                                setKeepModifiedDate(v)
                                            }
                                            yesLabel={"Keep"}
                                            noLabel={"Replace"}
                                            ariaLabelledby="Whether or not to replace dataset last modified date"
                                        />
                                    </td>
                                </tr>
                                <tr>
                                    <td valign="top">Keywords</td>
                                    <td>
                                        {stateData.dataset.keywords
                                            ? stateData.dataset.keywords.keywords.map(
                                                  (item, idx) =>
                                                      renderKeywordItem(
                                                          item,
                                                          idx
                                                      )
                                              )
                                            : "N/A"}
                                    </td>
                                    <td>
                                        {newKeywords
                                            ? newKeywords.keywords.map(
                                                  (item, idx) =>
                                                      renderKeywordItem(
                                                          item,
                                                          idx
                                                      )
                                              )
                                            : "N/A"}
                                    </td>
                                    <td>
                                        <TwoOptionsButton
                                            disabled={
                                                newKeywords ? false : true
                                            }
                                            value={keepKeywords}
                                            onChange={(v) => setKeepKeywords(v)}
                                            yesLabel={"Keep"}
                                            noLabel={"Replace"}
                                            ariaLabelledby="Whether or not to replace dataset keywords"
                                        />
                                    </td>
                                </tr>
                                <tr>
                                    <td valign="top">Spatial extent</td>
                                    <td>
                                        {renderBBox(stateData?.spatialCoverage)}
                                    </td>
                                    <td>{renderBBox(newSpatialExtent)}</td>
                                    <td>
                                        <TwoOptionsButton
                                            disabled={
                                                newSpatialExtent ? false : true
                                            }
                                            value={keepSpatialExtent}
                                            onChange={(v) =>
                                                setKeepSpatialExtent(v)
                                            }
                                            yesLabel={"Keep"}
                                            noLabel={"Replace"}
                                            ariaLabelledby="Whether or not to replace Spatial extent"
                                        />
                                    </td>
                                </tr>
                                <tr>
                                    <td valign="top">
                                        Temporal (time) coverage
                                    </td>
                                    <td>
                                        {renderTemporalCoverage(
                                            stateData?.temporalCoverage
                                        )}
                                    </td>
                                    <td>
                                        {renderTemporalCoverage(
                                            newTemporalCoverage
                                        )}
                                    </td>
                                    <td>
                                        <TwoOptionsButton
                                            disabled={
                                                newTemporalCoverage
                                                    ? false
                                                    : true
                                            }
                                            value={keepTemporalCoverage}
                                            onChange={(v) =>
                                                setKeepTemporalCoverage(v)
                                            }
                                            yesLabel={"Keep"}
                                            noLabel={"Replace"}
                                            ariaLabelledby="Whether or not to replace Temporal (time) coverage"
                                        />
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="bottom-button-area">
                    <div>
                        <AsyncButton onClick={onConfirmClick}>
                            Confirm
                        </AsyncButton>{" "}
                        &nbsp;&nbsp;&nbsp;
                        <AsyncButton isSecondary={true} onClick={onCancel}>
                            Cancel
                        </AsyncButton>
                    </div>
                </div>
            </div>
        </OverlayBox>
    );
};

export default ConfirmMetadataModal;
