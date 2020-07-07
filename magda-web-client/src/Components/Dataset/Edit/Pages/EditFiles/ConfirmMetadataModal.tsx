import React, { FunctionComponent, useState, useCallback } from "react";
import OverlayBox from "Components/Common/OverlayBox";
import AsyncButton from "Components/Common/AsyncButton";
import {
    State,
    DatasetStateUpdaterType,
    SpatialCoverage,
    TemporalCoverage,
    Interval,
    Distribution,
    saveRuntimeStateToStorage
} from "Components/Dataset/Add/DatasetAddCommon";
import { VersionItem } from "api-clients/RegistryApis";
import Tooltip from "Components/Dataset/Add/ToolTip";
import TwoOptionsButton from "Components/Common/TwoOptionsButton";
import moment from "moment";
import uniqBy from "lodash/uniqBy";
import SpatialDataPreviewer from "Components/Dataset/Add/SpatialAreaInput/SpatialDataPreviewer";
import promisifySetState from "helpers/promisifySetState";
import ErrorMessageBox from "Components/Common/ErrorMessageBox";

import "./ConfirmMetadataModal.scss";

type PropsType = {
    datasetId: string;
    isOpen: boolean;
    setIsOpen: (boolean) => void;
    stateData: State;
    datasetStateUpdater: DatasetStateUpdaterType;
    afterClose?: () => void;
};

function retrieveNewMetadataDatasetTitle(state: State) {
    const newDists = state.distributions.filter(
        (item) => item.isReplacementComfired === false
    );
    let newTitle;
    newDists.forEach((item) => {
        if (
            item?.datasetTitle &&
            typeof item.datasetTitle === "string" &&
            item.datasetTitle.trim()
        ) {
            newTitle = item.datasetTitle.trim();
        }
    });
    if (newTitle) {
        return newTitle;
    } else {
        return;
    }
}

function retrieveNewMetadataDatasetIssueDate(state: State) {
    const newDists = state.distributions.filter(
        (item) => item.isReplacementComfired === false
    );
    const issueDateList: Date[] = [];
    newDists.forEach((item) => {
        if (item?.issued?.getTime) {
            issueDateList.push(item.issued);
        }
    });
    if (!issueDateList.length) {
        return;
    }
    // --- return the `easiest` date as new suggested issue date
    issueDateList.sort((a, b) => a.getTime() - b.getTime());
    return issueDateList[0];
}

function retrieveNewMetadataDatasetModifiedDate(state: State) {
    const newDists = state.distributions.filter(
        (item) => item.isReplacementComfired === false
    );
    const modifiedDateList: Date[] = [];
    newDists.forEach((item) => {
        if (item?.modified?.getTime!) {
            modifiedDateList.push(item.modified);
        }
    });
    if (!modifiedDateList.length) {
        return;
    }
    // --- return the `latest` date as new suggested modified date
    modifiedDateList.sort((a, b) => b.getTime() - a.getTime());
    return modifiedDateList[0];
}

function retrieveNewMetadataDatasetKeywords(state: State) {
    const newDists = state.distributions.filter(
        (item) => item.isReplacementComfired === false
    );
    let keywords: string[] = [];
    newDists.forEach((item) => {
        if (item?.keywords?.length) {
            keywords = keywords.concat(item.keywords);
        }
    });
    if (!keywords.length) {
        return;
    }
    keywords = uniqBy(keywords, (item) => item.toLowerCase().trim());
    return keywords;
}

// -- Bounding box in order minlon (west), minlat (south), maxlon (east), maxlat (north)
type BoundingBoxType = [number, number, number, number];

function mergeBBoxes(
    b1?: BoundingBoxType,
    b2?: BoundingBoxType
): BoundingBoxType | undefined {
    if (b1?.length !== 4 && b2?.length !== 4) {
        return undefined;
    }
    if (b1?.length !== 4) {
        return b2;
    }
    if (b2?.length !== 4) {
        return b1;
    }

    const newBBox: BoundingBoxType = [...b1] as BoundingBoxType;

    // --- create a bbox cover both bboxes (bigger)
    newBBox[0] = b2[0] < newBBox[0] ? b2[0] : newBBox[0];
    newBBox[1] = b2[1] < newBBox[1] ? b2[1] : newBBox[1];
    newBBox[2] = b2[2] > newBBox[2] ? b2[2] : newBBox[2];
    newBBox[3] = b2[3] > newBBox[3] ? b2[3] : newBBox[3];

    return newBBox;
}

function retrieveNewMetadataDatasetSpatialExtent(
    state: State
): SpatialCoverage | undefined {
    const newDists = state.distributions.filter(
        (item) => item.isReplacementComfired === false
    );

    let newBBox: BoundingBoxType | undefined;

    newDists.forEach((item) => {
        if (item?.spatialCoverage?.bbox?.length === 4) {
            newBBox = mergeBBoxes(newBBox, item.spatialCoverage.bbox);
        }
    });

    if (newBBox?.length !== 4) {
        return;
    } else {
        return {
            spatialDataInputMethod: "bbox",
            bbox: newBBox
        };
    }
}

const isEmptyOrInvalidTemporalInterval = (i?: Interval) =>
    !i || (!i?.end?.getDate && !i?.start?.getDate);

const isEmptyOrInvalidTemporalIntervals = (i?: Interval[]) =>
    !i?.length || !i.find((item) => !isEmptyOrInvalidTemporalInterval(item));

function mergeTemporalIntervals(i1?: Interval[], i2?: Interval[]) {
    if (
        isEmptyOrInvalidTemporalIntervals(i1) &&
        isEmptyOrInvalidTemporalIntervals(i2)
    ) {
        return undefined;
    }
    if (isEmptyOrInvalidTemporalIntervals(i1)) {
        return i2;
    }
    if (isEmptyOrInvalidTemporalIntervals(i2)) {
        return i1;
    }
    i1 = i1!.filter((item) => !isEmptyOrInvalidTemporalInterval(item));
    i2 = i2!.filter((item) => !isEmptyOrInvalidTemporalInterval(item));

    const newIntervals = [...i1, ...i2] as Interval[];
    return newIntervals;
}

function retrieveNewMetadataDatasetTemporalCoverage(
    state: State
): TemporalCoverage | undefined {
    const newDists = state.distributions.filter(
        (item) => item.isReplacementComfired === false
    );

    let intervals = [] as Interval[] | undefined;

    newDists.forEach((item) => {
        if (item?.temporalCoverage?.intervals?.length) {
            intervals = mergeTemporalIntervals(
                intervals,
                item.temporalCoverage.intervals
            );
        }
    });

    if (!intervals?.length) {
        return;
    } else {
        return {
            intervals
        };
    }
}

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
    const { stateData, datasetId, setIsOpen, datasetStateUpdater } = props;

    const [error, setErrors] = useState<Error | null>(null);

    const newTitle = retrieveNewMetadataDatasetTitle(stateData);
    const newIssueDate = retrieveNewMetadataDatasetIssueDate(stateData);
    const newModifiedDate = retrieveNewMetadataDatasetModifiedDate(stateData);
    const newKeywords = retrieveNewMetadataDatasetKeywords(stateData);
    const newSpatialExtent = retrieveNewMetadataDatasetSpatialExtent(stateData);
    const newTemporalCoverage = retrieveNewMetadataDatasetTemporalCoverage(
        stateData
    );

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
        newKeywords?.length ? false : true
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

                if (!keepTitle) {
                    newState.dataset.title = newTitle;
                }
                if (!keepIssueDate) {
                    newState.dataset.issued = newIssueDate;
                }
                if (!keepModifiedDate) {
                    newState.dataset.modified = newModifiedDate;
                }
                if (!keepKeywords) {
                    if (!newState?.dataset?.keywords) {
                        newState.dataset.keywords = {
                            derived: false,
                            keywords: []
                        };
                    }
                    newState.dataset.keywords = {
                        ...newState.dataset.keywords,
                        keywords: [
                            ...newState.dataset.keywords.keywords,
                            ...newKeywords!
                        ]
                    };
                }
                if (!keepSpatialExtent) {
                    newState.spatialCoverage = newSpatialExtent!;
                }
                if (!keepTemporalCoverage) {
                    newState.temporalCoverage = newTemporalCoverage!;
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
    }, [
        datasetId,
        setIsOpen,
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

    if (!props.isOpen) {
        return null;
    }

    return (
        <OverlayBox
            className="confirm-metadata-modal"
            isOpen={props.isOpen}
            title="Replace the existing automated metadata fields?"
            onClose={() => props.setIsOpen(false)}
            onAfterClose={props.afterClose}
        >
            <div className="content-area">
                <div className="inner-content-area">
                    <ErrorMessageBox error={error} scollIntoView={true} />

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
                                            ? moment(newIssueDate).format(
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
                                            ? newKeywords.map((item, idx) =>
                                                  renderKeywordItem(item, idx)
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
                        <AsyncButton
                            isSecondary={true}
                            onClick={() => props.setIsOpen(false)}
                        >
                            Cancel
                        </AsyncButton>
                    </div>
                </div>
            </div>
        </OverlayBox>
    );
};

export default ConfirmMetadataModal;
