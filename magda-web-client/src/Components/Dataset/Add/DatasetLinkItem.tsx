import React, { useState } from "react";
import { useAsync } from "react-async-hook";
import moment from "moment";
import uuid from "uuid";
import fetch from "isomorphic-fetch";
import { config } from "config";
import {
    Distribution,
    DistributionState,
    DistributionSource
} from "Components/Dataset/Add/DatasetAddCommon";
import "./DatasetLinkItem.scss";

import { AlwaysEditor } from "Components/Editing/AlwaysEditor";
import { dateEditor } from "Components/Editing/Editors/dateEditor";
import { getFormatIcon } from "../View/DistributionIcon";
import editIcon from "../../../assets/edit.svg";
import dismissIcon from "../../../assets/dismiss.svg";

import SlimTextInputWithValidation from "../Add/SlimTextInputWithValidation";
import * as ValidationManager from "./ValidationManager";
import ValidationRequiredLabel from "../../Dataset/Add/ValidationRequiredLabel";
import { MultilineTextEditor } from "Components/Editing/Editors/textEditor";
import promiseAny from "helpers/promiseAny";

type Props = {
    distribution: Distribution;
    idx: number;
    addDistribution: (distribution: Distribution) => void;
    editDistribution: (
        updater: (distribution: Distribution) => Distribution
    ) => void;
    deleteDistribution: () => void;
    className?: string;
};

type ProcessingProps = {
    distribution: Distribution;
};

type EditViewProps = {
    distribution: Distribution;
    idx: number;
    editDistribution: (
        updater: (distribution: Distribution) => Distribution
    ) => void;
    editMode: boolean;
    setEditMode: (editMode: boolean) => void;
};

type CompleteViewProps = {
    distribution: Distribution;
    editMode: boolean;
    setEditMode: (editMode: boolean) => void;
    deleteDistribution: () => void;
};

const DatasetLinkItemComplete = (props: CompleteViewProps) => {
    const { distribution, setEditMode, editMode, deleteDistribution } = props;

    return (
        <div className="dataset-link-item-complete">
            <button
                className={`edit-button au-btn au-btn--secondary`}
                aria-label="Edit distribution metadata"
                onClick={() => setEditMode(!editMode)}
            >
                <img src={editIcon} />
            </button>
            <button
                className={`delete-button au-btn au-btn--secondary`}
                arial-label="Delete distribution metadata"
                onClick={() => deleteDistribution()}
            >
                <img src={dismissIcon} />
            </button>
            <div>
                <h3 className="link-item-title">{distribution.title}</h3>
                <div className="link-item-details">
                    <div>
                        <b>Format:</b>{" "}
                        {distribution.format ? distribution.format : "N/A"}
                    </div>
                    <div>
                        <b>Last Modified:</b>{" "}
                        {moment(distribution.modified).format("DD/MM/YYYY")}
                    </div>
                    <div>
                        <b>URL:</b> {distribution.downloadURL}
                    </div>
                    <div className="description-area">
                        <b>Service description:</b>{" "}
                        {distribution.description
                            ? distribution.description
                            : "N/A"}
                    </div>
                </div>
            </div>
        </div>
    );
};

const DatasetLinkItemProcessing = (props: ProcessingProps) => {
    const distribution = props.distribution;

    const progress = distribution._progress ? distribution._progress : 0;
    let width = Math.ceil((progress / 100) * 330);
    if (width < 5) width = 5;

    return (
        <div className="processing-item">
            <div className="distribution-in-progress">
                <div className="distribution-icon-area">
                    <img
                        className="format-icon"
                        src={getFormatIcon(
                            {
                                downloadURL: distribution.downloadURL
                            },
                            "gis"
                        )}
                    />
                    <div className="format-text">{distribution.format}</div>
                </div>
                <div className="distribution-info">
                    <div className="distribution-name">
                        <div className="distribution-name">
                            {distribution.title}
                        </div>
                    </div>
                    <div className="distribution-progress-bar">
                        <div
                            className="distribution-progress-bar-content"
                            style={{ width: `${width}px` }}
                        >
                            &nbsp;
                        </div>
                        <div
                            className="distribution-progress-bar-box"
                            style={{ width: `${width}px` }}
                        >
                            &nbsp;
                        </div>
                    </div>
                    <div className="distribution-status">
                        Reviewing service - {distribution._progress}% complete
                    </div>
                </div>
            </div>
        </div>
    );
};

const DatasetLinkItemEditing = (props: EditViewProps) => {
    const {
        idx,
        setEditMode,
        editMode,
        distribution,
        editDistribution
    } = props;

    const editFormat = (newValue: string | undefined) =>
        editDistribution(distribution => ({
            ...distribution,
            format: newValue
        }));
    const editTitle = (newValue: string | undefined) =>
        editDistribution(distribution => ({
            ...distribution,
            title: newValue ? newValue : ""
        }));
    const editModified = (newValue: Date | undefined) =>
        editDistribution(fidistributionle =>
            typeof newValue === "undefined"
                ? distribution
                : { ...distribution, modified: newValue }
        );
    const editDescription = (newValue: string | undefined) =>
        editDistribution(distribution => ({
            ...distribution,
            description: newValue ? newValue : ""
        }));

    return (
        <div className="dataset-link-item-edit">
            <button
                className={`au-btn link-item-save-button`}
                arial-label="Save changes"
                onClick={() => {
                    if (
                        ValidationManager.validateFields([
                            `$.distributions[${idx}].title`,
                            `$.distributions[${idx}].format`
                        ])
                    ) {
                        setEditMode(!editMode);
                    }
                }}
            >
                Save
            </button>
            <div className="row">
                <div className="col-sm-6 title-field-input-area">
                    <span>
                        Title:&nbsp;&nbsp;{" "}
                        <ValidationRequiredLabel
                            validationFieldPath={`$.distributions[${idx}].title`}
                        />
                    </span>
                    &nbsp;&nbsp;
                    <SlimTextInputWithValidation
                        validationFieldLabel="Title"
                        validationFieldPath={`$.distributions[${idx}].title`}
                        value={distribution.title}
                        onChange={editTitle}
                        placeholder="Please enter title..."
                    />
                </div>
                <div className="col-sm-6 format-field-input-area">
                    <span>
                        Format:{" "}
                        <ValidationRequiredLabel
                            validationFieldPath={`$.distributions[${idx}].format`}
                        />
                    </span>
                    &nbsp;&nbsp;
                    <SlimTextInputWithValidation
                        validationFieldLabel="Format"
                        validationFieldPath={`$.distributions[${idx}].format`}
                        value={distribution.format}
                        onChange={editFormat}
                        placeholder="Please enter format..."
                    />
                </div>
            </div>
            <div className="row">
                <div className="col-sm-12">
                    <span>Last Modified: </span>
                    &nbsp;&nbsp;
                    <AlwaysEditor
                        value={distribution.modified}
                        onChange={editModified}
                        editor={dateEditor}
                    />
                </div>
            </div>
            <div className="row">
                <div className="col-sm-12 description-input-area">
                    <MultilineTextEditor
                        validationFieldPath={`$.distributions[${idx}].description`}
                        validationFieldLabel="Service Description"
                        value={distribution.description}
                        placeholder="Enter service description text..."
                        onChange={editDescription}
                    />
                </div>
            </div>
        </div>
    );
};

/**
 * Talks to openfaas gateway to retrieve a list of functions with `data-url-processor` labels.
 * Here the `data-url-processor` label is a user-defined label that we use to distinguish the purposes of function.
 * Therefore, other connectors can opt to support this feature later without any frontend changes.
 * We only need the name field of the returned data items to invoke the function later
 * Documents of openfaas gateway can be found from:
 * https://github.com/openfaas/faas/tree/master/api-docs
 *
 * @returns
 */
async function getAllDataUrlProcessorsFromOpenfaasGateway() {
    const res = await fetch(
        `${config.openfaasBaseUrl}/system/functions`,
        config.fetchOptions
    );
    if (res.status !== 200) {
        throw new Error(
            "Failed to contact openfaas gateway: " + res.statusText
        );
    }
    const data: any[] = await res.json();
    if (!data || !data.length) {
        return [];
    }
    return data.filter(
        item => item.labels && item.labels.magdaType === "data-url-processor"
    );
}

interface UrlProcessingError extends Error {
    unableProcessUrl?: boolean;
}

const DatasetLinkItem = (props: Props) => {
    const [editMode, setEditMode] = useState(false);

    useAsync(async () => {
        try {
            if (props.distribution._state !== DistributionState.Processing) {
                return;
            }
            const processors = await getAllDataUrlProcessorsFromOpenfaasGateway();
            if (!processors || !processors.length) {
                throw new Error(
                    "There is no data url processor has been deployed and available for service."
                );
            }

            const data = await promiseAny(
                processors.map(async item => {
                    const res = await fetch(
                        `${config.openfaasBaseUrl}/function/${item.name}`,
                        {
                            ...config.fetchOptions,
                            method: "post",
                            body: props.distribution.downloadURL
                        }
                    );
                    if (res.status !== 200) {
                        const e: UrlProcessingError = new Error(
                            `Failed to request function ${item.name}` +
                                res.statusText +
                                "\n" +
                                (await res.text())
                        );
                        e.unableProcessUrl = true;
                    }

                    const data = await res.json();
                    if (
                        !data ||
                        !data.distributions ||
                        !data.distributions.length
                    ) {
                        throw new Error(
                            `Process result contains less than 1 distribution`
                        );
                    }

                    data.distributions = data.distributions.filter(
                        item =>
                            item.aspects &&
                            item.aspects["dcat-distribution-strings"]
                    );

                    if (!data.distributions.length) {
                        throw new Error(
                            `Process result contains less than 1 distribution with valid "dcat-distribution-strings" aspect`
                        );
                    }

                    return data;
                })
            ).catch(e => {
                console.log(e);
                if (e && e.length) {
                    // --- only deal with the first error
                    if (e.UrlProcessingError === true) {
                        // --- We simplify the url processing error message here
                        // --- Different data sources might fail to recognise the url for different technical reasons but those info may be too technical to the user.
                        throw new Error(
                            "System cannot recognise or process the URL."
                        );
                    } else {
                        // --- notify the user the `post processing` error as it'd be more `relevant` message (as at least the url has been recognised now).
                        // --- i.e. url is recognised and processed but meta data is not valid or insufficient (e.g. no distributions)
                        throw e;
                    }
                }
            });

            props.editDistribution(distribution => {
                return {
                    ...distribution,
                    ...data.distributions[0].aspects[
                        "dcat-distribution-strings"
                    ],
                    creationSource: DistributionSource.DatasetUrl,
                    _state: DistributionState.Ready
                };
            });

            // --- if there are more than one distribution returned, added to the list
            if (data.distributions.length > 1) {
                data.distributions.slice(1).forEach(item => {
                    props.addDistribution({
                        ...item.aspects["dcat-distribution-strings"],
                        id: uuid.v4(),
                        creationSource: DistributionSource.DatasetUrl,
                        _state: DistributionState.Ready
                    });
                });
            }
        } catch (e) {
            props.deleteDistribution();
            alert("" + e);
        }
    }, [props.distribution.id]);

    if (props.distribution._state !== DistributionState.Ready) {
        return (
            <div
                className={`dataset-link-item-container ${
                    props.className ? props.className : ""
                }`}
            >
                <DatasetLinkItemProcessing distribution={props.distribution} />
            </div>
        );
    } else if (editMode) {
        return (
            <div className="dataset-link-item-container">
                <DatasetLinkItemEditing
                    idx={props.idx}
                    distribution={props.distribution}
                    editDistribution={props.editDistribution}
                    setEditMode={setEditMode}
                    editMode={editMode}
                />
            </div>
        );
    } else {
        return (
            <div className="dataset-link-item-container">
                <DatasetLinkItemComplete
                    distribution={props.distribution}
                    setEditMode={setEditMode}
                    editMode={editMode}
                    deleteDistribution={props.deleteDistribution}
                />
            </div>
        );
    }
};

export default DatasetLinkItem;
