import React, { useState } from "react";
import moment from "moment";
import {
    Distribution,
    DistributionState,
    DistributionCreationMethod
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

type Props = {
    distribution: Distribution;
    idx?: number;
    className?: string;
    onDelete?: () => any;
    onChange?: (updater: (file: Distribution) => Distribution) => void;
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
    setEditMode?: (editMode: boolean) => void;
    deleteDistribution?: () => void;
};

const DatasetLinkItemComplete = (props: CompleteViewProps) => {
    const { distribution, setEditMode, editMode, deleteDistribution } = props;

    return (
        <div className="dataset-link-item-complete">
            {setEditMode ? (
                <button
                    className={`edit-button au-btn au-btn--secondary`}
                    aria-label="Edit distribution metadata"
                    onClick={() => setEditMode(!editMode)}
                >
                    <img src={editIcon} alt="edit button" />
                </button>
            ) : null}

            {deleteDistribution ? (
                <button
                    className={`delete-button au-btn au-btn--secondary`}
                    arial-label="Delete distribution metadata"
                    onClick={() => deleteDistribution()}
                >
                    <img src={dismissIcon} alt="delete button" />
                </button>
            ) : null}

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
                    <div className="link-item-url">
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
    if (width < 5) {
        width = 5;
    }

    return (
        <div className="processing-item">
            <div className="distribution-in-progress">
                <div className="distribution-icon-area">
                    <img
                        alt="format icon"
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
                        Reviewing service - {progress}% complete
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
        editDistribution((distribution) => ({
            ...distribution,
            format: newValue?.toUpperCase?.()
        }));
    const editTitle = (newValue: string | undefined) =>
        editDistribution((distribution) => ({
            ...distribution,
            title: newValue ? newValue : ""
        }));
    const editModified = (newValue: Date | undefined) =>
        editDistribution((fidistributionle) =>
            typeof newValue === "undefined"
                ? distribution
                : { ...distribution, modified: newValue }
        );
    const editDescription = (newValue: string | undefined) =>
        editDistribution((distribution) => ({
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
                        if (distribution?._state !== DistributionState.Ready) {
                            editDistribution((distribution) => ({
                                ...distribution,
                                _state: DistributionState.Ready
                            }));
                        }
                    }
                }}
            >
                Save
            </button>
            <div className="row">
                <div className="col-sm-6 title-field-input-area">
                    <span>
                        Title:{" "}
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
            <div className="row last-modified-input-area">
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

const DatasetLinkItem = (props: Props) => {
    const [editMode, setEditMode] = useState(
        props.distribution?.creationMethod ===
            DistributionCreationMethod.Manual &&
            props.distribution?._state === DistributionState.Drafting
    );

    const canEdit =
        typeof props.idx !== "undefined" &&
        typeof props.onChange === "function";

    const canDelete = typeof props.onDelete === "function";

    if (
        props.distribution._state !== DistributionState.Ready &&
        props.distribution._state !== DistributionState.Drafting
    ) {
        return (
            <div
                className={`dataset-link-item-container ${
                    props.className ? props.className : ""
                } ${!canEdit && !canDelete ? "read-only" : ""}`}
            >
                <DatasetLinkItemProcessing distribution={props.distribution} />
            </div>
        );
    } else if (editMode && canEdit) {
        return (
            <div
                className={`dataset-link-item-container  ${
                    props.className ? props.className : ""
                } ${!canEdit && !canDelete ? "read-only" : ""}`}
            >
                <DatasetLinkItemEditing
                    idx={props.idx!}
                    distribution={props.distribution}
                    editDistribution={props.onChange!}
                    setEditMode={setEditMode}
                    editMode={editMode}
                />
            </div>
        );
    } else {
        return (
            <div
                className={`dataset-link-item-container  ${
                    props.className ? props.className : ""
                } ${!canEdit && !canDelete ? "read-only" : ""}`}
            >
                {/* When `props.onChange` not exist, turn off the edit & delete icon */}
                <DatasetLinkItemComplete
                    distribution={props.distribution}
                    setEditMode={props.onChange ? setEditMode : undefined}
                    editMode={editMode}
                    deleteDistribution={props.onDelete}
                />
            </div>
        );
    }
};

export default DatasetLinkItem;
