import React from "react";
import { withRouter } from "react-router";

import Breadcrumbs from "Components/Common/Breadcrumbs";
import { Medium } from "Components/Common/Responsive";

import FileIcon from "Components/Common/FileIcon";

import Styles from "./DatasetAddFilesPage.module.scss";

import { AlwaysEditor } from "Components/Editing/AlwaysEditor";

import {
    textEditor,
    textEditorEx,
    multilineTextEditor,
    multiTextEditorEx,
    dateEditor,
    multiDateIntervalEditor
} from "Components/Editing/Editors/textEditor";

import {
    codelistEditor,
    multiCodelistEditor
} from "Components/Editing/Editors/codelistEditor";

import { bboxEditor } from "Components/Editing/Editors/spatialEditor";

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

const aspects = {
    publishing: datasetPublishingAspect,
    "dcat-dataset-strings": dcatDatasetStringsAspect,
    "spatial-coverage": spatialCoverageAspect,
    "temporal-coverage": temporalCoverageAspect,
    "dataset-distributions": datasetDistributionsAspect,
    "dcat-distribution-strings": dcatDistributionStringsAspect
};

import uuidv1 from "uuid/v1";
import uuidv4 from "uuid/v4";

import * as codelists from "constants/DatasetConstants";

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

    edit = (aspectField: string) => (field: string) => (newValue: string) => {
        this.setState(state => {
            const item = Object.assign({}, state[aspectField]);
            item[field] = newValue;
            return Object.assign({}, state, { [aspectField]: item });
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
                                {files.map(file => (
                                    <p>
                                        &nbsp; &nbsp;
                                        <FileIcon width="1em" />
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
                        editor={multiCodelistEditor(codelists.languages, true)}
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
                <h4>When was the dataset was published or issued?</h4>
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
                        value={dataset.modified}
                        onChange={editDataset("modified")}
                        editor={dateEditor}
                    />
                </p>
                <h4>How frequency is the dataset updated?</h4>
                <p>
                    <AlwaysEditor
                        value={dataset.accrualPeriodicity}
                        onChange={editDataset("accrualPeriodicity")}
                        editor={codelistEditor(codelists.accrualPeriodicity)}
                    />
                </p>
                <h4>What time period does the dataset cover?</h4>
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
                <h4>
                    What organisation is responsible for publishing this
                    dataset?
                </h4>
                <AlwaysEditor
                    value={dataset.publisher}
                    onChange={editDataset("publisher")}
                    editor={textEditor}
                />
                <h4>Who is the primary contact point for this dataset?</h4>
                <AlwaysEditor
                    value={dataset.contactPoint}
                    onChange={editDataset("contactPoint")}
                    editor={multilineTextEditor}
                />
                <h4>
                    How should the contact point(s) be referenced in the
                    metadata?
                </h4>
                <AlwaysEditor
                    value={dataset.contactPointDisplay}
                    onChange={editDataset("contactPointDisplay")}
                    editor={codelistEditor(codelists.contactPointDisplay)}
                />
                <h4>
                    Was this dataset produced collaborating with other
                    organisations?
                </h4>
                <AlwaysEditor
                    value={dataset.creation_affiliatedOrganisation}
                    onChange={editDataset("creation_affiliatedOrganisation")}
                    editor={multilineTextEditor}
                />
                <h4>How was the dataset produced?</h4>
                <AlwaysEditor
                    value={dataset.creation_mechanism}
                    onChange={editDataset("creation_mechanism")}
                    editor={multilineTextEditor}
                />
                <h4>What system was the dataset produced with?</h4>
                <AlwaysEditor
                    value={dataset.creation_sourceSystem}
                    onChange={editDataset("creation_sourceSystem")}
                    editor={textEditor}
                />
            </div>
        );
    }
    renderRestriction() {
        const { dataset, datasetPublishing } = this.state;

        const editDataset = this.edit("dataset");
        const editDatasetPublishing = this.edit("datasetPublishing");
        return (
            <div>
                <h2>Dataset visibility, access and control</h2>
                <h4>Who can see the dataset once it is published?</h4>
                <AlwaysEditor
                    value={datasetPublishing.level}
                    onChange={editDatasetPublishing("level")}
                    editor={codelistEditor(codelists.publishingLevel)}
                />
                <h4>What is the security classification of this dataset?</h4>
                <AlwaysEditor
                    value={dataset.informationSecurity_classification}
                    onChange={editDataset("informationSecurity_classification")}
                    editor={codelistEditor(codelists.classification)}
                />
                <h4>What is the sensitivity of this dataset?</h4>
                <AlwaysEditor
                    value={dataset.informationSecurity_disseminationLimits}
                    onChange={editDataset(
                        "informationSecurity_disseminationLimits"
                    )}
                    editor={multiCodelistEditor(codelists.disseminationLimits)}
                />
            </div>
        );
    }

    renderDescription() {
        const { dataset } = this.state;
        const editDataset = this.edit("dataset");
        return (
            <div>
                <h2>Dataset description</h2>
                <AlwaysEditor
                    value={dataset.description}
                    onChange={editDataset("description")}
                    editor={multilineTextEditor}
                />
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
            files
        } = this.state;
        const inputDistributions = files.map(file => {
            return {
                id: createId("dist"),
                name: file.title,
                aspects: {
                    "dcat-distribution-strings": file
                }
            };
        });
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
                }
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

import LightBulbIcon from "assets/light-bulb.svg";

function ToolTip(props) {
    return (
        <p>
            <img src={LightBulbIcon} style={{ width: "2em", float: "left" }} />
            {props.children}
        </p>
    );
}
