import React from "react";

import { AlwaysEditor } from "Components/Editing/AlwaysEditor";
import {
    textEditorEx,
    MultilineTextEditor
} from "Components/Editing/Editors/textEditor";
import {
    dateEditor,
    multiDateIntervalEditor
} from "Components/Editing/Editors/dateEditor";

import ToolTip from "Components/Dataset/Add/ToolTip";
import SpatialAreaInput, {
    InputMethod as SpatialAreaInputInputMethod
} from "../../SpatialAreaInput";
import { BoundingBox } from "helpers/datasetSearch";

import CustomMultiValueRemove from "../../../../Common/react-select/CustomMultiValueRemove";

import * as codelists from "constants/DatasetConstants";
import TagInput from "Components/Common/TagInput";
import AccrualPeriodicityInput from "../../AccrualPeriodicityInput";

import ReactSelect from "react-select";
import ReactSelectStyles from "../../../../Common/react-select/ReactSelectStyles";

import {
    State,
    CurrentStatusType
} from "Components/Dataset/Add/DatasetAddCommon";
import { User } from "reducers/userManagementReducer";

import helpIcon from "assets/help.svg";

import DatasetAutoComplete from "../People/DatasetAutocomplete";
import "../People/DatasetAutocomplete.scss";

import "./index.scss";

type Props = {
    edit: <K extends keyof State>(
        aspectField: K
    ) => (field: string) => (newValue: any) => void;
    setState: <State>(
        state: ((prevState: Readonly<State>) => State) | State,
        callback?: () => void
    ) => void;
    user: User;
    stateData: State;
};

export default function DatasetAddAccessAndUsePage(props: Props) {
    const {
        dataset,
        spatialCoverage,
        temporalCoverage,
        currency
    } = props.stateData;
    const editDataset = props.edit("dataset");
    const editTemporalCoverage = props.edit("temporalCoverage");
    const editCurrency = props.edit("currency");
    return (
        <div className="row dataset-details-and-contents-page">
            <div className="col-sm-12">
                <h2>Details and Contents</h2>
                <h3 className="with-underline">Title and language</h3>
                <div className="question-title">
                    <h4>What is the title of the dataset?</h4>
                    <div>
                        <AlwaysEditor
                            value={dataset.title}
                            onChange={editDataset("title")}
                            editor={textEditorEx({ required: true })}
                        />
                    </div>
                </div>

                <div className="question-language">
                    <h4>What language(s) is the dataset available in?</h4>
                    <div>
                        <ReactSelect
                            className="react-select"
                            isMulti={true}
                            isSearchable={true}
                            components={{
                                MultiValueRemove: CustomMultiValueRemove
                            }}
                            options={codelists.languageOptions as any}
                            onChange={values =>
                                editDataset("languages")(
                                    Array.isArray(values)
                                        ? values.map(item => item.value)
                                        : []
                                )
                            }
                            styles={ReactSelectStyles}
                            value={(dataset.languages
                                ? dataset.languages
                                : ["eng"]
                            ).map(item => ({
                                label: codelists.languages[item],
                                value: item
                            }))}
                        />
                    </div>
                </div>

                <h3 className="with-underline">Contents</h3>
                <div className="question-keyword">
                    <h4>Which keywords best describe this dataset?</h4>
                    <ToolTip>
                        Keywords are specific words that your dataset contains,
                        and they help people search for specific datasets. We
                        recommend keywords and kept to 10-15 words. We've
                        identified the top keywords from your document.
                    </ToolTip>
                    <div className="clearfix">
                        <TagInput
                            value={dataset.keywords}
                            onChange={editDataset("keywords")}
                            placeHolderText="Enter a keyword"
                            useVocabularyAutoCompleteInput={true}
                        />
                    </div>
                </div>

                <div className="question-theme">
                    <h4>Which themes does this dataset cover?</h4>
                    <ToolTip>
                        Themes are the topics your dataset covers and they help
                        people find related datasets within a topic. We
                        recommend themes are kept to 5-10 topics. We've
                        identified themes from your document, that are
                        consistent with similar datasets.
                    </ToolTip>
                    <div className="clearfix">
                        <TagInput
                            value={dataset.themes}
                            onChange={editDataset("themes")}
                            placeHolderText="Enter a theme"
                            useVocabularyAutoCompleteInput={false}
                        />
                    </div>
                </div>

                <div className="question-description">
                    <h4>Please add a description for this dataset</h4>
                    <ToolTip>
                        A good dataset description clearly and succintly
                        explains the contents, purpose and value of the dataset.
                        This is how users primarily identify and select your
                        dataset from others. Here you can also include
                        information that you have not already covered in the
                        metadata.
                    </ToolTip>
                    <div className="clearfix">
                        <MultilineTextEditor
                            value={dataset.description}
                            placerHolder="Enter description text"
                            limit={250}
                            onChange={props.edit("dataset")("description")}
                        />
                    </div>
                </div>

                <h3 className="with-underline">Dates and updates</h3>

                <div className="question-dataset-status">
                    <h4>What is the status of the this dataset?</h4>
                    <div className="row">
                        <div className="col-sm-6">
                            <ReactSelect
                                className="react-select"
                                isMulti={false}
                                isSearchable={false}
                                options={Object.keys(
                                    codelists.datasetCurrencyStatus
                                ).map(key => ({
                                    label: codelists.datasetCurrencyStatus[key],
                                    value: key
                                }))}
                                onChange={(item: any) => {
                                    const status = item.value as CurrentStatusType;
                                    editCurrency("status")(status);
                                    if (status !== "SUPERSEDED") {
                                        editCurrency("supersededBy")([]);
                                    }
                                    if (status !== "RETIRED") {
                                        editCurrency("retireReason")("");
                                    }
                                }}
                                styles={ReactSelectStyles}
                                value={{
                                    label:
                                        codelists.datasetCurrencyStatus[
                                            currency.status
                                        ],
                                    value: currency.status
                                }}
                            />
                        </div>
                    </div>
                </div>

                {currency.status === "SUPERSEDED" ? (
                    <div className="question-dataset-superseded-by">
                        <h4>What dataset has it been superseded by?</h4>

                        <DatasetAutoComplete
                            user={props.user}
                            value={currency.supersededBy}
                            onDatasetSelected={editCurrency("supersededBy")}
                        />
                    </div>
                ) : null}

                {currency.status === "RETIRED" ? (
                    <div className="question-dataset-retire-reason">
                        <h4>Why was this dataset retired?</h4>
                        <MultilineTextEditor
                            value={currency.retireReason}
                            placerHolder="Enter dataset retire reason"
                            onChange={editCurrency("retireReason")}
                        />
                    </div>
                ) : null}

                <div className="row date-row">
                    <div className="col-sm-4 question-issue-date">
                        <h4>
                            <span>When was the dataset first issued?</span>
                            <span className="help-icon-container">
                                <img src={helpIcon} />
                            </span>
                        </h4>
                        <AlwaysEditor
                            value={dataset.issued}
                            onChange={editDataset("issued")}
                            editor={dateEditor}
                        />
                    </div>
                    <div className="col-sm-4 question-recent-modify-date">
                        <h4>When was the dataset most recently modified?</h4>
                        <AlwaysEditor
                            value={dataset.modified}
                            onChange={editDataset("modified")}
                            editor={dateEditor}
                        />
                    </div>
                </div>

                <div className="question-update-frequency">
                    <h4>How frequently is the dataset updated?</h4>
                    <AccrualPeriodicityInput
                        accrualPeriodicity={dataset.accrualPeriodicity}
                        accrualPeriodicityRecurrenceRule={
                            dataset.accrualPeriodicityRecurrenceRule
                        }
                        onAccrualPeriodicityChange={value =>
                            editDataset("accrualPeriodicity")(
                                value ? value : ""
                            )
                        }
                        onAccrualPeriodicityRecurrenceRuleChange={rule => {
                            editDataset("accrualPeriodicityRecurrenceRule")(
                                rule
                            );
                        }}
                    />
                </div>

                <div className="question-time-period">
                    <h4>What time period(s) does the dataset cover?</h4>
                    <AlwaysEditor
                        value={temporalCoverage.intervals}
                        onChange={editTemporalCoverage("intervals")}
                        editor={multiDateIntervalEditor}
                    />
                </div>
                <h3>Spatial area</h3>
                <div>
                    <SpatialAreaInput
                        countryId={spatialCoverage.lv1Id}
                        territoryOrSteId={spatialCoverage.lv2Id}
                        sa4Id={spatialCoverage.lv3Id}
                        sa3Id={spatialCoverage.lv4Id}
                        bbox={(() => {
                            if (
                                !Array.isArray(spatialCoverage.bbox) ||
                                spatialCoverage.bbox.length < 4
                            ) {
                                return undefined;
                            }
                            return {
                                west: spatialCoverage.bbox[0],
                                south: spatialCoverage.bbox[1],
                                east: spatialCoverage.bbox[2],
                                north: spatialCoverage.bbox[3]
                            };
                        })()}
                        onChange={(
                            method: SpatialAreaInputInputMethod,
                            bbox?: BoundingBox,
                            countryId?: string,
                            territoryOrSteId?: string,
                            sa4Id?: string,
                            sa3Id?: string
                        ) =>
                            props.setState(state => {
                                const spatialCoverage: any = {
                                    spatialDataInputMethod: method
                                };

                                if (bbox) {
                                    // --- According to existing JSON schema:
                                    // --- "Bounding box in order minlon (west), minlat (south), maxlon (east), maxlat (north)""
                                    spatialCoverage.bbox = [
                                        bbox.west,
                                        bbox.south,
                                        bbox.east,
                                        bbox.north
                                    ];
                                }

                                if (countryId)
                                    spatialCoverage.lv1Id = countryId;
                                if (territoryOrSteId)
                                    spatialCoverage.lv2Id = territoryOrSteId;
                                if (sa4Id) spatialCoverage.lv3Id = sa4Id;
                                if (sa3Id) spatialCoverage.lv4Id = sa3Id;

                                return {
                                    ...state,
                                    spatialCoverage
                                };
                            })
                        }
                    />
                </div>
            </div>
        </div>
    );
}
