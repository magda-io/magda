import React from "react";
import { withRouter } from "react-router";

import Breadcrumbs from "Components/Common/Breadcrumbs";
import { Medium } from "Components/Common/Responsive";
import FileIcon from "Components/Common/FileIcon";

import { AlwaysEditor } from "Components/Editing/AlwaysEditor";
import {
    textEditor,
    textEditorEx,
    multilineTextEditor,
    multiTextEditorEx
} from "Components/Editing/Editors/textEditor";
import {
    dateEditor,
    multiDateIntervalEditor
} from "Components/Editing/Editors/dateEditor";
import {
    codelistEditor,
    codelistRadioEditor,
    multiCodelistEditor
} from "Components/Editing/Editors/codelistEditor";
import { multiContactEditor } from "Components/Editing/Editors/contactEditor";
import { bboxEditor } from "Components/Editing/Editors/spatialEditor";
import ToolTip from "Components/Dataset/Add/ToolTip";
import HelpSnippet from "Components/Common/HelpSnippet";

import { createRecord } from "actions/recordActions";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";
import DeterminateProgressBar from "Components/Common/DeterminateProgressBar";

import datasetPublishingAspect from "@magda/registry-aspects/publishing.schema.json";
import dcatDatasetStringsAspect from "@magda/registry-aspects/dcat-dataset-strings.schema.json";
import spatialCoverageAspect from "@magda/registry-aspects/spatial-coverage.schema.json";
import temporalCoverageAspect from "@magda/registry-aspects/temporal-coverage.schema.json";
import datasetDistributionsAspect from "@magda/registry-aspects/dataset-distributions.schema.json";
import dcatDistributionStringsAspect from "@magda/registry-aspects/dcat-distribution-strings.schema.json";
import usageAspect from "@magda/registry-aspects/usage.schema.json";
import accessAspect from "@magda/registry-aspects/access.schema.json";

import dateParse from "date-fns/parse";

const aspects = {
    publishing: datasetPublishingAspect,
    "dcat-dataset-strings": dcatDatasetStringsAspect,
    "spatial-coverage": spatialCoverageAspect,
    "temporal-coverage": temporalCoverageAspect,
    "dataset-distributions": datasetDistributionsAspect,
    "dcat-distribution-strings": dcatDistributionStringsAspect,
    usage: usageAspect,
    access: accessAspect
};

import uuidv1 from "uuid/v1";
import uuidv4 from "uuid/v4";

import * as codelists from "constants/DatasetConstants";

import Styles from "./DatasetAddFilesPage.module.scss";

import {
    State,
    createBlankState,
    loadState,
    saveState
} from "./DatasetAddCommon";

import "./DatasetAddMetadataPage.scss";

type Prop = {
    createRecord: Function;
    isCreating: boolean;
    creationError: any;
    lastDatasetId: string;
    step: number;
    dataset: string;
    isNewDataset: boolean;
    history: any;
};

class NewDataset extends React.Component<Prop, State> {
    state: State = createBlankState();

    componentWillMount() {
        if (this.props.isNewDataset) {
            this.props.history.replace(
                `/dataset/add/metadata/${this.props.dataset}/${this.props.step}`
            );
        }
        this.setState(state =>
            Object.assign({}, state, loadState(this.props.dataset))
        );
    }

    steps: any = [
        {
            label: "Basic Details",
            render: this.renderBasicDetails.bind(this)
        },
        {
            label: "People and production",
            render: this.renderProduction.bind(this)
        },
        {
            label: "Dataset visibility, access and control",
            render: this.renderRestriction.bind(this)
        },
        {
            label: "Dataset description",
            render: this.renderDescription.bind(this)
        }
    ];

    edit = (aspectField: string) => (field: string) => (newValue: any) => {
        this.setState(state => {
            const item = Object.assign({}, state[aspectField]);
            item[field] = newValue;
            return Object.assign({}, state, { [aspectField]: item });
        });
    };

    editState = (field: string) => (newValue: any) => {
        this.setState(state => {
            return Object.assign({}, state, { [field]: newValue });
        });
    };

    render() {
        const { files } = this.state;

        let { step, lastDatasetId } = this.props;

        step = Math.max(Math.min(step, this.steps.length - 1), 0);

        const nextIsPublish = step + 1 >= this.steps.length;

        if (lastDatasetId) {
            this.props.history.push(`/dataset/${lastDatasetId}`);
        }
        return (
            <div className={Styles.root}>
                <Medium>
                    <Breadcrumbs
                        breadcrumbs={[
                            <li key="datasets">
                                <span>Add data</span>
                            </li>
                        ]}
                    />
                </Medium>
                <div className="row">
                    <div className="col-sm-12">
                        <h1>
                            Review and add metadata (step {step + 1} of{" "}
                            {this.steps.length})
                        </h1>
                        <DeterminateProgressBar
                            progress={((step + 1) / this.steps.length) * 100}
                        />
                    </div>
                </div>
                <div className="row">
                    <div className="col-sm-12">
                        <div className="dataset-add-files">
                            <p>
                                Magda has reviewed your files and pre-populated
                                metadata fields based on the contents.
                            </p>
                            <p>
                                Please review carefully, and update any fields
                                as required.
                            </p>
                            <div>
                                {files.map((file, i) => (
                                    <p key={i}>
                                        &nbsp; &nbsp;
                                        <FileIcon
                                            width="1em"
                                            text={file.format}
                                        />
                                        &nbsp; &nbsp;
                                        {file.title}
                                    </p>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                {this.steps[step].render()}
                <br />
                <br />
                <br />
                <div className="row">
                    <div className="col-sm-12">
                        <button
                            className="au-btn au-btn--secondary"
                            onClick={this.saveAndExit.bind(this)}
                        >
                            Save and exit
                        </button>
                        <button
                            className="au-btn"
                            style={{ float: "right" }}
                            onClick={
                                nextIsPublish
                                    ? this.publishDataset.bind(this)
                                    : this.gotoStep.bind(this, step + 1)
                            }
                        >
                            Next:{" "}
                            {nextIsPublish
                                ? "Publish draft dataset"
                                : this.steps[step + 1].label}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    saveAndExit() {
        saveState(this.state, this.props.dataset);
        this.props.history.push(`/dataset/list`);
    }

    gotoStep(step) {
        saveState(this.state, this.props.dataset);
        this.props.history.push("../" + this.props.dataset + "/" + step);
    }

    renderBasicDetails() {
        const { dataset, spatialCoverage, temporalCoverage } = this.state;
        const editDataset = this.edit("dataset");
        const editTemporalCoverage = this.edit("temporalCoverage");
        const editSpatialCoverage = this.edit("spatialCoverage");
        return (
            <div>
                <h2>Dataset details and contents</h2>
                <hr />
                <h3>Title and language</h3>
                <h4>What is the title of the dataset?</h4>
                <p>
                    <AlwaysEditor
                        value={dataset.title}
                        onChange={editDataset("title")}
                        editor={textEditorEx({ required: true })}
                    />
                </p>
                <br />
                <h4>What language(s) is the dataset available in?</h4>
                <p>
                    <AlwaysEditor
                        value={dataset.languages}
                        onChange={editDataset("languages")}
                        editor={multiCodelistEditor(
                            codelists.languages,
                            true,
                            "Add another language"
                        )}
                    />
                </p>
                <hr />
                <h3>Contents</h3>
                <h4>What keywords best describe this dataset?</h4>
                <ToolTip>
                    Keywords are specific words that your dataset contains, and
                    they help people search for specific datasets. We recommend
                    keywords and kept to 10-15 words. We've identified the top
                    keywords from your document.
                </ToolTip>
                <p>
                    <AlwaysEditor
                        value={dataset.keywords}
                        onChange={editDataset("keywords")}
                        editor={multiTextEditorEx({
                            placeholder: "Add a keyword"
                        })}
                    />
                </p>
                <h4>Which themes does this dataset cover?</h4>
                <ToolTip>
                    Themes are the topics your dataset covers and they help
                    people find related datasets within a topic. We recommend
                    themes are kept to 5-10 topics. We've identified themes from
                    your document, that are consistent with similar datasets.
                </ToolTip>
                <p>
                    <AlwaysEditor
                        value={dataset.themes}
                        onChange={editDataset("themes")}
                        editor={multiTextEditorEx({
                            placeholder: "Add a theme"
                        })}
                    />
                </p>
                <hr />
                <h3>Dates and updates</h3>
                <h4>When was the data first issued?</h4>
                <p>
                    <AlwaysEditor
                        value={dataset.issued}
                        onChange={editDataset("issued")}
                        editor={dateEditor}
                    />
                </p>
                <h4>When was the dataset most recently modified?</h4>
                <p>
                    <AlwaysEditor
                        value={
                            dataset.modified
                                ? dateParse(dataset.modified)
                                : undefined
                        }
                        onChange={editDataset("modified")}
                        editor={dateEditor}
                    />
                </p>
                <h4>How frequently is the dataset updated?</h4>
                <p>
                    <AlwaysEditor
                        value={dataset.accrualPeriodicity}
                        onChange={editDataset("accrualPeriodicity")}
                        editor={codelistEditor(codelists.accrualPeriodicity)}
                    />
                </p>
                <h4>What time period(s) does the dataset cover?</h4>
                <p>
                    <AlwaysEditor
                        value={temporalCoverage.intervals}
                        onChange={editTemporalCoverage("intervals")}
                        editor={multiDateIntervalEditor}
                    />
                </p>
                <hr />
                <h3>Spatial area</h3>
                <h4>
                    We've determined that the spatial extent of your data is:
                </h4>
                <p>
                    <AlwaysEditor
                        value={spatialCoverage.bbox}
                        onChange={editSpatialCoverage("bbox")}
                        editor={bboxEditor}
                    />
                </p>

                <h4>Would you like to show a spatial preview?</h4>

                <p>
                    <YesNoToggle yes={!!spatialCoverage.bbox}>
                        <p>Map preview: </p>
                        <BBOXPreview bbox={spatialCoverage.bbox} />
                    </YesNoToggle>
                </p>
            </div>
        );
    }

    renderProduction() {
        const { dataset } = this.state;

        const editDataset = this.edit("dataset");
        return (
            <div>
                <h2>People and production</h2>
                <hr />
                <h3>People</h3>
                <h4>
                    What organisation is responsible for publishing this
                    dataset?
                </h4>
                <p>
                    <AlwaysEditor
                        value={dataset.publisher}
                        onChange={editDataset("publisher")}
                        editor={textEditor}
                    />
                </p>
                <h4>Who is the primary contact point(s) for this dataset?</h4>
                <p>
                    <AlwaysEditor
                        value={dataset.contactPointFull}
                        onChange={editDataset("contactPointFull")}
                        editor={multiContactEditor({})}
                    />
                </p>
                <h4>
                    How should the contact point(s) be referenced in the
                    metadata?
                </h4>
                <p>
                    <AlwaysEditor
                        value={dataset.contactPointDisplay}
                        onChange={editDataset("contactPointDisplay")}
                        editor={codelistRadioEditor(
                            codelists.contactPointDisplay
                        )}
                    />
                </p>
                <hr />
                <h3>Production</h3>
                <h4>
                    Was this dataset produced in collaboration with with other
                    organisations?
                </h4>
                <p>
                    <YesNoEditReveal
                        value={dataset.creation_affiliatedOrganisation}
                        defaultValue={[]}
                        nullValue={null}
                        onChange={editDataset(
                            "creation_affiliatedOrganisation"
                        )}
                    >
                        <AlwaysEditor
                            value={dataset.creation_affiliatedOrganisation}
                            onChange={editDataset(
                                "creation_affiliatedOrganisation"
                            )}
                            editor={multiTextEditorEx({
                                placeholder: "Add an organisation"
                            })}
                        />
                    </YesNoEditReveal>
                </p>
                <h4>How was the dataset produced?</h4>
                <p>
                    <AlwaysEditor
                        value={dataset.creation_mechanism}
                        onChange={editDataset("creation_mechanism")}
                        editor={multilineTextEditor}
                    />
                </p>
            </div>
        );
    }
    renderRestriction() {
        let {
            files,
            datasetAccess,
            datasetUsage,
            datasetPublishing,
            _licenseLevel
        } = this.state;

        const editDatasetPublishing = this.edit("datasetPublishing");
        const editDatasetAccess = this.edit("datasetAccess");
        const editDatasetUsage = this.edit("datasetUsage");
        return (
            <div>
                <h2>Dataset access and use</h2>
                <hr />
                <h3>User access</h3>
                <h4>Who can see the dataset once it is published?</h4>
                <ToolTip>
                    We recommend you publish your data to everyone in your
                    organisation to help prevent data silos.
                </ToolTip>
                <p>
                    <AlwaysEditor
                        value={datasetPublishing.level}
                        onChange={editDatasetPublishing("level")}
                        editor={codelistRadioEditor(codelists.publishingLevel)}
                    />
                </p>
                <h4>Where can users access this dataset from?</h4>
                <ToolTip>
                    Select the best location for this file based on it's
                    contents and your organisation file structure.
                </ToolTip>
                <p>
                    <AlwaysEditor
                        value={datasetAccess.notes}
                        onChange={editDatasetAccess("notes")}
                        editor={textEditor}
                    />
                </p>
                <hr />
                <h3>Dataset use</h3>
                {files.length !== 0 && (
                    <React.Fragment>
                        <h4>
                            What type of license should be applied to these
                            files?
                        </h4>

                        <ToolTip>
                            By default, Magda adds Licenses at the Dataset Level
                            (i.e. to all files), but this can be overriden to
                            apply at a Distribution (each file or URL) level if
                            desired.
                        </ToolTip>

                        <p>
                            <AlwaysEditor
                                value={_licenseLevel}
                                onChange={this.editState("_licenseLevel")}
                                editor={codelistEditor(
                                    codelists.datasetLicenseLevel
                                )}
                            />
                        </p>
                    </React.Fragment>
                )}
                <h4>What license restrictions should be applied?</h4>
                <ToolTip>
                    We recommend a Whole of Government License be applied to
                    encourage inter-department data sharing in the future.
                </ToolTip>
                {_licenseLevel === "dataset" ? (
                    <div>
                        <p>
                            <AlwaysEditor
                                value={datasetUsage.licenseLevel}
                                onChange={editDatasetUsage("licenseLevel")}
                                editor={codelistEditor(codelists.licenseLevel)}
                            />
                        </p>
                        {datasetUsage.licenseLevel === "custom" && (
                            <p>
                                <AlwaysEditor
                                    value={datasetUsage.license}
                                    onChange={editDatasetUsage("license")}
                                    editor={textEditorEx({
                                        placeholder: "Please specify a license"
                                    })}
                                />
                            </p>
                        )}
                    </div>
                ) : (
                    <div>
                        {files.map((file, fileIndex) => {
                            const edit = field => value => {
                                file.usage[field] = value;
                                this.editState("files")(files);
                            };
                            return (
                                <div className="fileBlock">
                                    <span className="fileBlock-icon">
                                        <FileIcon
                                            text={file.format}
                                            width="1.5em"
                                        />
                                    </span>
                                    <span className="fileBlock-text">
                                        {file.title}
                                    </span>

                                    <div className="fileBlock-control">
                                        <p>
                                            <AlwaysEditor
                                                value={file.usage.licenseLevel}
                                                onChange={edit("licenseLevel")}
                                                editor={codelistEditor(
                                                    codelists.licenseLevel
                                                )}
                                            />
                                        </p>
                                        {file.usage.licenseLevel ===
                                            "custom" && (
                                            <p>
                                                <AlwaysEditor
                                                    value={file.usage.license}
                                                    onChange={edit("license")}
                                                    editor={textEditorEx({
                                                        placeholder:
                                                            "Please specify a license"
                                                    })}
                                                />
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <h4>What is the security classification of this dataset?</h4>
                <p>
                    <AlwaysEditor
                        value={datasetUsage.securityClassification}
                        onChange={editDatasetUsage("securityClassification")}
                        editor={codelistEditor(codelists.classification)}
                    />
                </p>
                <h4>What is the sensitivity of this dataset?</h4>
                <HelpSnippet>
                    <p>
                        Magda security classification refers to the
                        Attorney-General Department's Sensitive and
                        Classification policy.
                        <br />
                        It is important that the appropriate security
                        classification level is selected to protect the
                        confidentiality, integrity and availability of the data.
                        The framework is as follows:
                    </p>
                    <p>
                        UNCLASSIFIED: Compromise of information confidentiality
                        would be expected to cause{" "}
                        <b>low or no business impact.</b>
                    </p>
                    <p>
                        PROTECTED: Compromise of information confidentiality
                        would be expected to cause{" "}
                        <b>
                            limited damage to an individual, organisation or
                            government generally if compromised.
                        </b>
                    </p>
                    <p>
                        CONFIDENTIAL: Compromise of information confidentiality
                        would be expected to cause{" "}
                        <b>
                            damage to the national interest, organisations or
                            individuals.
                        </b>
                    </p>
                    <p>
                        SECRET: Compromise of information confidentiality would
                        be expected to cause{" "}
                        <b>
                            serious damage to national interest, organisations
                            or individuals.
                        </b>
                    </p>
                    <p>
                        TOP SECRET: Compromise of information confidentiality
                        would be expected to cause{" "}
                        <b>
                            exceptionally grave damage to te national interest,
                            organisations or individuals.
                        </b>
                    </p>
                </HelpSnippet>

                <p>
                    <AlwaysEditor
                        value={datasetUsage.disseminationLimits}
                        onChange={editDatasetUsage("disseminationLimits")}
                        editor={multiCodelistEditor(
                            codelists.disseminationLimits
                        )}
                    />
                </p>
            </div>
        );
    }

    renderDescription() {
        const { dataset } = this.state;
        const editDataset = this.edit("dataset");
        return (
            <div>
                <h2>Dataset description</h2>
                <h3>Please describe the dataset</h3>
                <ToolTip>
                    A good dataset description clearly and succinctly explains
                    the contantes, purpose and value of the dataset. <br />
                    This is how users primarily identify and select your dataset
                    from others
                    <br />
                    Here you can also include information that you have not
                    already covered in the metadata.
                </ToolTip>
                <p>
                    <AlwaysEditor
                        value={dataset.description}
                        onChange={editDataset("description")}
                        editor={multilineTextEditor}
                    />
                </p>
            </div>
        );
    }

    async publishDataset() {
        saveState(this.state, this.props.dataset);

        const id = createId("ds");
        const {
            dataset,
            datasetPublishing,
            spatialCoverage,
            temporalCoverage,
            files,
            _licenseLevel,
            datasetUsage,
            datasetAccess
        } = this.state;
        const inputDistributions = files.map(file => {
            let usage: any = undefined;
            if (_licenseLevel !== "dataset") {
                usage = file.usage;
            }
            return {
                id: createId("dist"),
                name: file.title,
                aspects: {
                    "dcat-distribution-strings": Object.assign(file, {
                        usage: undefined
                    }),
                    usage
                }
            };
        });
        let usage: any = undefined;
        if (_licenseLevel === "dataset") {
            usage = datasetUsage;
        }
        const inputDataset = {
            id,
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
                usage
            }
        };
        this.props.createRecord(inputDataset, inputDistributions, aspects);
    }
}

function mapStateToProps(state, old) {
    let dataset = old.match.params.dataset;
    let isNewDataset = false;
    if (!dataset || dataset === "-") {
        dataset = "dataset-" + uuidv4();
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
        dataset,
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
            createRecord: createRecord
        },
        dispatch
    );
};

export default withRouter(
    connect(
        mapStateToProps,
        mapDispatchToProps
    )(NewDataset)
);

function createId(type = "ds") {
    return `magda-${type}-${uuidv1()}--${uuidv4()}`;
}

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

class YesNoToggle extends React.Component<any, any> {
    constructor(props) {
        super(props);
        this.state = {
            yes: !!props.yes
        };
    }

    updateState(update: any) {
        this.setState(Object.assign({}, this.state, update));
    }
    render() {
        const { yes } = this.state;
        return (
            <div>
                <p>
                    <button
                        className={"au-btn " + (yes || "au-btn--secondary")}
                        onClick={this.updateState.bind(this, {
                            yes: true
                        })}
                    >
                        Yes
                    </button>
                    <button
                        className={"au-btn " + (!yes || "au-btn--secondary")}
                        onClick={this.updateState.bind(this, {
                            yes: false
                        })}
                    >
                        No
                    </button>
                </p>
                {yes && this.props.children}
            </div>
        );
    }
}

import { Map, TileLayer, Rectangle } from "react-leaflet";

function BBOXPreview(props) {
    let bbox = props.bbox || [-180.0, -90.0, 180.0, 90.0];
    let [minlon, minlat, maxlon, maxlat] = bbox;
    const isValid =
        !isNaN(minlon) && !isNaN(minlat) && !isNaN(maxlon) && !isNaN(maxlat);
    const bounds = [[minlat, minlon], [maxlat, maxlon]];
    return (
        <div>
            {isValid ? (
                <Map bounds={bounds} animate={true}>
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
                    />
                    <Rectangle bounds={bounds} />
                </Map>
            ) : (
                <div className={"leaflet-container"}>
                    Please enter valid coordinates
                </div>
            )}
        </div>
    );
}

function YesNoEditReveal(props) {
    const yes = !!props.value;
    const name = Math.random() + "";
    const yesOpts: any = {
        name,
        value: "yes"
    };
    const noOpts: any = { name, value: "no" };
    if (yes) {
        yesOpts.checked = "checked";
    } else {
        noOpts.checked = true;
    }
    yesOpts.onChange = noOpts.onChange = e => {
        if (e.target.value === "yes") {
            props.onChange(props.defaultValue);
        } else {
            props.onChange(props.nullValue);
        }
    };
    return (
        <div>
            <div>
                <div className="au-control-input">
                    <input
                        className="au-control-input__input"
                        type="radio"
                        id={name + "-no"}
                        {...noOpts}
                    />
                    <label
                        htmlFor={name + "-no"}
                        className="au-control-input__text"
                    >
                        No
                    </label>
                </div>
            </div>
            <div>
                <div className="au-control-input">
                    <input
                        className="au-control-input__input"
                        type="radio"
                        id={name + "-yes"}
                        {...yesOpts}
                    />
                    <label
                        className="au-control-input__text"
                        htmlFor={name + "-yes"}
                    >
                        Yes
                    </label>
                </div>
            </div>
            {yes && props.children}
        </div>
    );
}
