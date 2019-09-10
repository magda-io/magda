import React from "react";
import { withRouter } from "react-router";
import uuidv4 from "uuid/v4";
import ReactSelect from "react-select";

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

import {
    createRecord,
    createNewDatasetReset,
    createNewDatasetError
} from "actions/recordActions";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";

import ReactSelectStyles from "../../Common/react-select/ReactSelectStyles";
import CustomMultiValueRemove from "../../Common/react-select/CustomMultiValueRemove";
import { Steps as ProgressMeterStepsConfig } from "../../Common/AddDatasetProgressMeter";

import * as codelists from "constants/DatasetConstants";
import TagInput from "Components/Common/TagInput";
import AccrualPeriodicityInput from "./AccrualPeriodicityInput";
import {
    State,
    saveState,
    OrganisationAutocompleteChoice,
    createId
} from "./DatasetAddCommon";
import DatasetAddPeoplePage from "./Pages/People/DatasetAddPeoplePage";
import { createPublisher, ensureAspectExists } from "api-clients/RegistryApis";
import DatasetAddAccessAndUsePage from "./Pages/DatasetAddAccessAndUsePage";
import withAddDatasetState from "./withAddDatasetState";

import datasetPublishingAspect from "@magda/registry-aspects/publishing.schema.json";
import dcatDatasetStringsAspect from "@magda/registry-aspects/dcat-dataset-strings.schema.json";
import spatialCoverageAspect from "@magda/registry-aspects/spatial-coverage.schema.json";
import temporalCoverageAspect from "@magda/registry-aspects/temporal-coverage.schema.json";
import datasetDistributionsAspect from "@magda/registry-aspects/dataset-distributions.schema.json";
import dcatDistributionStringsAspect from "@magda/registry-aspects/dcat-distribution-strings.schema.json";
import accessAspect from "@magda/registry-aspects/access.schema.json";
import provenanceAspect from "@magda/registry-aspects/provenance.schema.json";
import informationSecurityAspect from "@magda/registry-aspects/information-security.schema.json";
import datasetAccessControlAspect from "@magda/registry-aspects/dataset-access-control.schema.json";
import organizationDetailsAspect from "@magda/registry-aspects/organization-details.schema.json";
import datasetPublisherAspect from "@magda/registry-aspects/dataset-publisher.schema.json";

import "./DatasetAddMetadataPage.scss";
import "./DatasetAddFilesPage.scss";
import "./DatasetAddCommon.scss";
import { autocompletePublishers } from "api-clients/SearchApis";

import SpatialAreaInput, {
    InputMethod as SpatialAreaInputInputMethod
} from "./SpatialAreaInput";

import { BoundingBox } from "helpers/datasetSearch";

import ReviewFilesList from "./ReviewFilesList";

import ErrorMessageBox from "./ErrorMessageBox";

import helpIcon from "assets/help.svg";
import { User } from "reducers/userManagementReducer";

const aspects = {
    publishing: datasetPublishingAspect,
    "dcat-dataset-strings": dcatDatasetStringsAspect,
    "spatial-coverage": spatialCoverageAspect,
    "temporal-coverage": temporalCoverageAspect,
    "dataset-distributions": datasetDistributionsAspect,
    "dcat-distribution-strings": dcatDistributionStringsAspect,
    access: accessAspect,
    provenance: provenanceAspect,
    "information-security": informationSecurityAspect,
    "dataset-access-control": datasetAccessControlAspect,
    "dataset-publisher": datasetPublisherAspect
};

type Props = {
    initialState: State;
    createRecord: Function;
    createNewDatasetReset: Function;
    createNewDatasetError: Function;
    isCreating: boolean;
    creationError: any;
    lastDatasetId: string;
    step: number;
    datasetId: string;
    isNewDataset: boolean;
    history: any;
    user: User;
};

class NewDataset extends React.Component<Props, State> {
    state: State = this.props.initialState;

    componentDidMount() {
        if (this.props.isNewDataset) {
            this.props.history.replace(
                `/dataset/add/metadata/${this.props.datasetId}/${
                    this.props.step
                }`
            );
        }
    }

    steps: any = [
        this.renderBasicDetails.bind(this),
        () => (
            <DatasetAddPeoplePage
                edit={this.edit}
                dataset={this.state.dataset}
                publishing={this.state.datasetPublishing}
                provenance={this.state.provenance}
                user={this.props.user}
            />
        ),
        () => (
            <DatasetAddAccessAndUsePage
                edit={this.edit}
                editState={this.editState}
                stateData={this.state}
            />
        ),
        this.renderSubmitPage.bind(this)
    ];

    edit = <K extends keyof State>(aspectField: K) => (field: string) => (
        newValue: any
    ) => {
        this.setState(state => {
            return {
                [aspectField]: { ...state[aspectField], [field]: newValue }
            } as Pick<State, K>;
        });
    };

    editState = <K extends keyof State>(field: K) => (newValue: any) => {
        this.setState({ [field]: newValue } as Pick<State, K>);
    };

    render() {
        const { files } = this.state;

        let { step } = this.props;

        step = Math.max(Math.min(step, this.steps.length - 1), 0);

        const nextIsPublish = step + 1 >= this.steps.length;

        return (
            <div className="dataset-add-files-root dataset-add-meta-data-pages">
                <div className="row">
                    <div className="col-sm-12">
                        <ReviewFilesList
                            key={step}
                            files={files}
                            isOpen={step < 1 ? true : false}
                        />
                    </div>
                </div>
                {this.steps[step]()}
                <br />
                <br />
                <ErrorMessageBox />
                <br />
                <div className="row next-save-button-row">
                    <div className="col-sm-12">
                        <button
                            className="au-btn next-button"
                            onClick={
                                nextIsPublish
                                    ? this.performPublishDataset.bind(this)
                                    : this.gotoStep.bind(this, step + 1)
                            }
                        >
                            Next:{" "}
                            {nextIsPublish
                                ? this.state.isPublishing
                                    ? "Publishing as draft..."
                                    : "Publish draft dataset"
                                : ProgressMeterStepsConfig[step + 2].title}
                        </button>
                        <button
                            className="au-btn au-btn--secondary save-button"
                            onClick={this.saveAndExit.bind(this)}
                        >
                            Save and exit
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    resetError() {
        this.props.createNewDatasetReset();
    }

    async saveAndExit() {
        try {
            await this.resetError();
            saveState(this.state, this.props.datasetId);
            this.props.history.push(`/dataset/list`);
        } catch (e) {
            this.props.createNewDatasetError(e);
        }
    }

    async gotoStep(step) {
        try {
            await this.resetError();
            saveState(this.state, this.props.datasetId);
            this.props.history.push("../" + this.props.datasetId + "/" + step);
        } catch (e) {
            this.props.createNewDatasetError(e);
        }
    }

    renderBasicDetails() {
        const { dataset, spatialCoverage, temporalCoverage } = this.state;
        const editDataset = this.edit("dataset");
        const editTemporalCoverage = this.edit("temporalCoverage");
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
                            Keywords are specific words that your dataset
                            contains, and they help people search for specific
                            datasets. We recommend keywords and kept to 10-15
                            words. We've identified the top keywords from your
                            document.
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
                            Themes are the topics your dataset covers and they
                            help people find related datasets within a topic. We
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
                            explains the contents, purpose and value of the
                            dataset. This is how users primarily identify and
                            select your dataset from others. Here you can also
                            include information that you have not already
                            covered in the metadata.
                        </ToolTip>
                        <div className="clearfix">
                            <MultilineTextEditor
                                value={dataset.description}
                                placerHolder="Enter description text"
                                limit={250}
                                onChange={this.edit("dataset")("description")}
                            />
                        </div>
                    </div>

                    <h3 className="with-underline">Dates and updates</h3>

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
                            <h4>
                                When was the dataset most recently modified?
                            </h4>
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
                                this.setState(state => {
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

    renderSubmitPage() {
        const { datasetPublishing } = this.state;
        return (
            <div className="row dataset-submit-page">
                <div className="col-sm-12">
                    <h2 className="with-underline">
                        Additional notes or comments
                    </h2>
                    <h3>
                        Optional space to leave a note for the dataset Approver
                    </h3>
                    <ToolTip icon={helpIcon}>
                        Leave any additional comments you feel relevant to this
                        dataset
                    </ToolTip>
                    <div>
                        <MultilineTextEditor
                            value={datasetPublishing.notesToApprover}
                            placerHolder="Enter additional notes"
                            onChange={this.edit("datasetPublishing")(
                                "notesToApprover"
                            )}
                        />
                    </div>
                </div>
            </div>
        );
    }

    async performPublishDataset() {
        try {
            await this.resetError();
            await this.publishDataset();
            this.props.history.push(`/dataset/${this.props.lastDatasetId}`);
        } catch (e) {
            this.setState({
                isPublishing: false
            });
            this.props.createNewDatasetError(e);
        }
    }

    async publishDataset() {
        saveState(this.state, this.props.datasetId);

        const {
            dataset,
            datasetPublishing,
            spatialCoverage,
            temporalCoverage,
            files,
            licenseLevel,
            informationSecurity,
            datasetAccess,
            provenance
        } = this.state;

        this.setState({
            isPublishing: true
        });

        let publisherId;
        if (dataset.publisher) {
            publisherId = getOrgIdFromAutocompleteChoice(dataset.publisher);

            this.edit("dataset")("publisher")({
                name: dataset.publisher.name,
                publisherId
            });
        }

        const inputDistributions = files.map(file => {
            const aspect =
                licenseLevel === "dataset"
                    ? {
                          ...file,
                          license: dataset.defaultLicense
                      }
                    : file;

            return {
                id: createId("dist"),
                name: file.title,
                aspects: {
                    "dcat-distribution-strings": aspect
                }
            };
        });

        const inputDataset = {
            id: this.props.datasetId,
            name: dataset.title,
            aspects: {
                publishing: datasetPublishing,
                "dcat-dataset-strings": denormalise(dataset),
                "spatial-coverage": spatialCoverage,
                "temporal-coverage": temporalCoverage,
                "dataset-distributions": {
                    distributions: inputDistributions.map(d => d.id)
                },
                access: datasetAccess,
                "information-security": informationSecurity,
                "dataset-access-control": {
                    orgUnitOwnerId: dataset.owningOrgUnitId
                },
                provenance: {
                    mechanism: provenance.mechanism,

                    sourceSystem: provenance.sourceSystem,
                    derivedFrom:
                        provenance.derivedFrom &&
                        provenance.derivedFrom.map(choice => ({
                            id: choice.existingId
                                ? [choice.existingId]
                                : undefined,
                            name: !choice.existingId ? choice.name : undefined
                        })),
                    affiliatedOrganizationIds:
                        provenance.affiliatedOrganizations &&
                        (await Promise.all(
                            provenance.affiliatedOrganizations.map(org =>
                                getOrgIdFromAutocompleteChoice(org)
                            )
                        )),
                    isOpenData: provenance.isOpenData
                },
                "dataset-publisher": publisherId && {
                    publisher: publisherId
                }
            }
        };

        if (!inputDataset.aspects["dataset-access-control"].orgUnitOwnerId) {
            delete inputDataset.aspects["dataset-access-control"];
        }

        await this.props.createRecord(
            inputDataset,
            inputDistributions,
            aspects
        );
    }
}

async function getOrgIdFromAutocompleteChoice(
    organization: OrganisationAutocompleteChoice
) {
    let orgId: string;
    if (!organization.existingId) {
        // Do a last check to make sure the publisher really doesn't exist
        const existingPublishers = await autocompletePublishers(
            {},
            organization.name
        );

        const match = existingPublishers.options.find(
            publisher =>
                publisher.value.toLowerCase().trim() ===
                organization!.name.toLowerCase().trim()
        );

        if (!match) {
            // OK no publisher, lets add it
            await ensureAspectExists(
                "organization-details",
                organizationDetailsAspect
            );

            orgId = uuidv4();
            await createPublisher({
                id: orgId,
                name: organization.name,
                aspects: {
                    "organization-details": {
                        name: organization.name,
                        title: organization.name,
                        imageUrl: "",
                        description: "Added manually during dataset creation"
                    }
                }
            });
        } else {
            orgId = match.identifier;
        }
    } else {
        orgId = organization.existingId;
    }

    return orgId;
}

function mapStateToProps(state, old) {
    let datasetId = old.match.params.dataset;
    let isNewDataset = false;
    if (!datasetId || datasetId === "-") {
        datasetId = "dataset-" + uuidv4();
        isNewDataset = true;
    }
    const step = parseInt(old.match.params.step);
    const isCreating =
        state.record.newDataset && state.record.newDataset.isCreating;
    const creationError =
        state.record.newDataset && state.record.newDataset.error;
    const lastDatasetId =
        !isCreating &&
        state.record.newDataset &&
        state.record.newDataset.dataset &&
        state.record.newDataset.dataset.id;
    return {
        datasetId,
        isNewDataset,
        step,
        isCreating,
        creationError,
        lastDatasetId
    };
}

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            createRecord: createRecord,
            createNewDatasetReset: createNewDatasetReset,
            createNewDatasetError: createNewDatasetError
        },
        dispatch
    );
};

export default withAddDatasetState(
    withRouter(
        connect(
            mapStateToProps,
            mapDispatchToProps
        )(NewDataset)
    )
);

function denormalise(values) {
    const output = {};

    for (let [key, value] of Object.entries(values)) {
        const parts = key.split(/[_]+/g);
        let parent = output;
        while (parts.length > 1) {
            const part = parts.splice(0, 1)[0];
            parent = parent[part] || (parent[part] = {});
        }
        parent[parts[0]] = value;
    }

    return output;
}
