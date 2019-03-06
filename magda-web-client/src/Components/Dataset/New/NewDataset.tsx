import React from "react";
import FileDrop from "react-file-drop";

import Breadcrumbs from "../../../UI/Breadcrumbs";
import { Medium } from "../../../UI/Responsive";
import Spinner from "../../Spinner";

import Styles from "./NewDataset.module.scss";

import { AlwaysEditor } from "../../Editing/AlwaysEditor";

import {
    textEditor,
    textEditorEx,
    multilineTextEditor,
    multiTextEditor,
    dateEditor,
    multiDateIntervalEditor
} from "../../Editing/Editors/textEditor";

import {
    codelistEditor,
    multiCodelistEditor
} from "../../Editing/Editors/codelistEditor";

import { bboxEditor } from "../../Editing/Editors/spatialEditor";
import { booleanEditor } from "../../Editing/Editors/booleanEditor";

import { createRecord } from "../../../actions/recordActions";
import { bindActionCreators } from "redux";
import { connect } from "react-redux";

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

import { extractors } from "./extractors";

import * as codelists from "./codelists";

type File = {
    title: string;
    description?: string;
    issued?: string;
    modified?: string;
    license?: string;
    rights?: string;
    accessURL?: string;
    accessNotes?: string;
    downloadURL?: string;
    byteSize?: number;
    mediaType?: string;
    format?: string;

    datasetTitle: string;
    author?: string;
    keywords?: string[];
    themes?: string[];
    temporalCoverage?: any;
    spatialCoverage?: any;

    similarFingerprint?: any;
    equalHash?: string;
};

type Dataset = {
    title?: string;
    description?: string;
    issued?: Date;
    modified?: Date;
    languages?: string[];
    keywords?: string[];
    themes?: string[];
    contactPoint?: string;
    publisher?: string;
    landingPage?: string;
    importance?: string;
    accrualPeriodicity?: string;
    creation_affiliatedOrganisation?: string;
    creation_sourceSystem?: string;
    creation_mechanism?: string;
    creation_isOpenData?: boolean;
    accessLevel?: string;
    informationSecurity_disseminationLimits?: string[];
    informationSecurity_classification?: string;
};

type DatasetPublishing = {
    state?: string;
};

type SpatialCoverage = {
    bbox?: number[];
};

type Prop = {
    createRecord: Function;
    isCreating: boolean;
    creationError: any;
    lastDatasetId: string;
};

type State = {
    files: File[];
    dataset: Dataset;
    datasetPublishing: DatasetPublishing;
    processing: boolean;
    spatialCoverage: SpatialCoverage;
    temporalCoverage: TemporalCoverage;
};

type TemporalCoverage = {
    intervals: Interval[];
};

type Interval = {
    start?: string;
    end?: string;
};

class NewDataset extends React.Component<Prop, State> {
    state: State = {
        files: [],
        processing: false,
        dataset: {},
        datasetPublishing: {},
        spatialCoverage: {},
        temporalCoverage: {
            intervals: []
        }
    };

    onDrop = async (fileList: FileList) => {
        try {
            this.setState({
                processing: true
            });
            this.addFiles(fileList);
        } catch (e) {
            console.error(e);
        }
    };

    addFiles = async (fileList: FileList) => {
        const newFilesToAdd: File[] = [];
        for (let i = 0; i < fileList.length; i++) {
            const thisFile = fileList.item(i);

            if (thisFile) {
                const newFile = {
                    datasetTitle: toTitleCase(
                        turnPunctuationToSpaces(
                            trimExtension(thisFile.name || "File Name")
                        )
                    ).trim(),
                    title: thisFile.name,
                    byteSize: thisFile.size,
                    modified: new Date(thisFile.lastModified)
                        .toISOString()
                        .substr(0, 10),
                    format: thisFile.type
                };

                // done it this way to minimise duplicate content reading/processing
                const input: any = {
                    file: thisFile
                };

                input.arrayBuffer = await readFileAsArrayBuffer(thisFile);
                input.array = new Uint8Array(input.arrayBuffer);

                for (const extractor of extractors) {
                    try {
                        await extractor(input, newFile);
                    } catch (e) {
                        // even if one of the modules fail, we keep going
                        console.error(e);
                    }
                }

                newFilesToAdd.push(newFile);
            }
        }

        this.setState(
            state => {
                let newState: State = Object.assign({}, state, {
                    files: state.files.concat(newFilesToAdd),
                    processing: false,
                    dataset: Object.assign({}, state.dataset)
                });
                const { dataset, spatialCoverage, temporalCoverage } = newState;
                newFilesToAdd.forEach((file: any) => {
                    for (const key in file) {
                        // these fields don't belong in a distribution
                        switch (key) {
                            case "datasetTitle":
                                if (!dataset["title"]) {
                                    dataset["title"] = file[key];
                                    file[key] = undefined;
                                }
                                break;
                            case "keywords":
                            case "themes":
                                let value1: string[] = dataset[key] || [];
                                let value2: string[] = file[key] || [];
                                dataset[key] = value1.concat(value2);
                                file[key] = undefined;
                                break;

                            case "author":
                                dataset.contactPoint =
                                    dataset.contactPoint || "";
                                dataset.contactPoint += file.author;
                                file[key] = undefined;
                                break;

                            case "spatialCoverage":
                                Object.assign(spatialCoverage, file[key]);
                                file[key] = undefined;
                                break;
                            case "temporalCoverage":
                                temporalCoverage.intervals = temporalCoverage.intervals.concat(
                                    file[key].intervals
                                );
                                file[key] = undefined;
                                break;
                        }
                    }
                });
                return newState;
            },
            () => this.forceUpdate()
        );
    };

    editFile = (index: number, field: string) => (newName: string) => {
        this.setState(state => {
            const newFiles = state.files.concat();
            newFiles[index] = {
                ...newFiles[index],
                [field]: newName
            };

            return {
                files: newFiles
            };
        });
    };

    edit = (aspectField: string) => (field: string) => (newValue: string) => {
        this.setState(state => {
            const item = Object.assign({}, state[aspectField]);
            item[field] = newValue;
            console.log("CHANGED", aspectField, field, newValue);
            return Object.assign({}, state, { [aspectField]: item });
        });
    };

    addDataset = async (event: React.MouseEvent<HTMLButtonElement>) => {
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
    };

    render() {
        const {
            dataset,
            datasetPublishing,
            spatialCoverage,
            temporalCoverage
        } = this.state;
        const { lastDatasetId } = this.props;
        const editDataset = this.edit("dataset");
        const editDatasetPublishing = this.edit("datasetPublishing");
        const editSpatialCoverage = this.edit("spatialCoverage");
        const editTemporalCoverage = this.edit("temporalCoverage");

        if (lastDatasetId) {
            window.location.href = `/dataset/${lastDatasetId}`;
        }
        return (
            <div className={Styles.root}>
                <Medium>
                    <Breadcrumbs
                        breadcrumbs={[
                            <li key="datasets">
                                <span>Datasets</span>
                            </li>,
                            <li key="new dataset">
                                <span>Add</span>
                            </li>
                        ]}
                    />
                </Medium>

                <div className="row">
                    <div className="col-sm-12">
                        <h1>Add a Dataset</h1>
                    </div>
                </div>

                <div className="row">
                    <div className="col-sm-12">
                        <h2>Files</h2>
                        <p>
                            You can add a dataset to your catalogue by uploading
                            all the files within that dataset. Magda's
                            publishing tool will help you check for duplicates
                            and create high quality metadata for your catalogue.
                        </p>
                    </div>
                </div>

                <div className="row justify-content-center">
                    <div className="col-sm-12">
                        <FileDrop
                            onDrop={this.onDrop}
                            className={Styles.dropZone}
                            targetClassName={Styles.dropTarget}
                        >
                            {this.state.processing ? (
                                <Spinner width="5em" height="5em" />
                            ) : (
                                <span>Drag files here</span>
                            )}
                        </FileDrop>
                    </div>
                </div>

                <div className="row">
                    <div className="col-sm-8">
                        <ul>
                            {this.state.files.map((file, i) => {
                                return (
                                    <li key={i}>
                                        <h3>
                                            <AlwaysEditor
                                                value={file.title}
                                                onChange={this.editFile(
                                                    i,
                                                    "title"
                                                )}
                                                editor={textEditor}
                                            />
                                        </h3>

                                        <div>
                                            <div>
                                                <strong>Size: </strong>{" "}
                                                {humanFileSize(
                                                    file.byteSize,
                                                    false
                                                )}
                                            </div>
                                            <div>
                                                <strong>Last Modified: </strong>{" "}
                                                <AlwaysEditor
                                                    value={file.modified}
                                                    onChange={this.editFile(
                                                        i,
                                                        "modified"
                                                    )}
                                                    editor={dateEditor}
                                                />
                                            </div>
                                            <div>
                                                <strong>License: </strong>{" "}
                                                <AlwaysEditor
                                                    value={file.license}
                                                    onChange={this.editFile(
                                                        i,
                                                        "license"
                                                    )}
                                                    editor={textEditor}
                                                />
                                            </div>
                                            <div>
                                                <strong>Format: </strong>{" "}
                                                <AlwaysEditor
                                                    value={file.format}
                                                    onChange={this.editFile(
                                                        i,
                                                        "format"
                                                    )}
                                                    editor={textEditor}
                                                />
                                            </div>
                                            <div>
                                                <strong>Exact Hash:</strong>{" "}
                                                {file.equalHash}
                                            </div>

                                            <div>
                                                <strong>Fingerprint</strong>{" "}
                                                {Object.values(
                                                    file.similarFingerprint
                                                )
                                                    .filter(x => x !== 0)
                                                    .join(" ")}
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>

                <div className="row">
                    <div className="col-sm-8">
                        <h2>Review Metadata</h2>
                        <h3>What is this dataset called?*</h3>
                        <AlwaysEditor
                            value={dataset.title}
                            onChange={editDataset("title")}
                            editor={textEditorEx({ required: true })}
                        />
                        <h3>What is the state of the dataset?</h3>
                        <AlwaysEditor
                            value={datasetPublishing.state}
                            onChange={editDatasetPublishing("state")}
                            editor={codelistEditor(codelists.status)}
                        />
                        <h3>Who can see and use this dataset?</h3>
                        <AlwaysEditor
                            value={dataset.accessLevel}
                            onChange={editDataset("accessLevel")}
                            editor={codelistEditor(codelists.accessLevel)}
                        />
                        <h3>Is this public open data?</h3>
                        <AlwaysEditor
                            value={dataset.creation_isOpenData}
                            onChange={editDataset("creation_isOpenData")}
                            editor={booleanEditor}
                        />
                        <h3>Please describe the dataset:</h3>
                        <AlwaysEditor
                            value={dataset.description}
                            onChange={editDataset("description")}
                            editor={multilineTextEditor}
                        />
                        <h3>What languages is the dataset available in?</h3>
                        <AlwaysEditor
                            value={dataset.languages}
                            onChange={editDataset("languages")}
                            editor={multiCodelistEditor(
                                codelists.languages,
                                true
                            )}
                        />
                        <h3>What keywords best describe this dataset?</h3>
                        <AlwaysEditor
                            value={dataset.keywords}
                            onChange={editDataset("keywords")}
                            editor={multiTextEditor}
                        />
                        <h3>Which themes does this dataset cover?</h3>
                        <AlwaysEditor
                            value={dataset.themes}
                            onChange={editDataset("themes")}
                            editor={multiTextEditor}
                        />
                        <h3>What is the dataset priority within the agency?</h3>
                        <AlwaysEditor
                            value={dataset.importance}
                            onChange={editDataset("importance")}
                            editor={codelistEditor(codelists.importance)}
                        />
                        <h3>Who should be contacted regarding this dataset?</h3>
                        <AlwaysEditor
                            value={dataset.contactPoint}
                            onChange={editDataset("contactPoint")}
                            editor={multilineTextEditor}
                        />
                        <h3>
                            Who is responsible for making the dataset available?
                        </h3>
                        <AlwaysEditor
                            value={dataset.publisher}
                            onChange={editDataset("publisher")}
                            editor={textEditor}
                        />

                        <h3>
                            Was this dataset produced collaborating with other
                            organisations?
                        </h3>
                        <AlwaysEditor
                            value={dataset.creation_affiliatedOrganisation}
                            onChange={editDataset(
                                "creation_affiliatedOrganisation"
                            )}
                            editor={multilineTextEditor}
                        />
                        <h3>When was the dataset was published or issued?</h3>
                        <AlwaysEditor
                            value={dataset.issued}
                            onChange={editDataset("issued")}
                            editor={dateEditor}
                        />
                        <h3>When was the dataset most recently modified?</h3>
                        <AlwaysEditor
                            value={dataset.modified}
                            onChange={editDataset("modified")}
                            editor={dateEditor}
                        />
                        <h3>How frequency is the dataset is published?</h3>
                        <AlwaysEditor
                            value={dataset.accrualPeriodicity}
                            onChange={editDataset("accrualPeriodicity")}
                            editor={codelistEditor(
                                codelists.accrualPeriodicity
                            )}
                        />
                        <h3>
                            Which geographical area is covered by the dataset?
                        </h3>
                        <AlwaysEditor
                            value={spatialCoverage.bbox}
                            onChange={editSpatialCoverage("bbox")}
                            editor={bboxEditor}
                        />
                        <h3>What time periods are covered by this dataset?</h3>
                        <AlwaysEditor
                            value={temporalCoverage.intervals}
                            onChange={editTemporalCoverage("intervals")}
                            editor={multiDateIntervalEditor}
                        />
                        <h3>Is the dataset sensitive?</h3>
                        <AlwaysEditor
                            value={
                                dataset.informationSecurity_disseminationLimits
                            }
                            onChange={editDataset(
                                "informationSecurity_disseminationLimits"
                            )}
                            editor={multiCodelistEditor(
                                codelists.disseminationLimits
                            )}
                        />
                        <h3>
                            What is the security classification of the dataset?
                        </h3>
                        <AlwaysEditor
                            value={dataset.informationSecurity_classification}
                            onChange={editDataset(
                                "informationSecurity_classification"
                            )}
                            editor={codelistEditor(codelists.classification)}
                        />
                        <h3>How was the dataset produced?</h3>
                        <AlwaysEditor
                            value={dataset.creation_mechanism}
                            onChange={editDataset("creation_mechanism")}
                            editor={multilineTextEditor}
                        />
                        <h3>What system was the dataset produced with?</h3>
                        <AlwaysEditor
                            value={dataset.creation_sourceSystem}
                            onChange={editDataset("creation_sourceSystem")}
                            editor={textEditor}
                        />
                        {this.props.creationError && (
                            <div className="au-body au-page-alerts au-page-alerts--error">
                                <h3>{this.props.creationError.title}</h3>
                                <p>{this.props.creationError.detail}</p>
                            </div>
                        )}
                        {this.props.isCreating ? (
                            <Spinner width="5em" height="5em" />
                        ) : (
                            <div>
                                <button
                                    className="au-btn"
                                    onClick={this.addDataset.bind(this)}
                                >
                                    Add Dataset
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }
}

function mapStateToProps(state) {
    const isCreating =
        state.record.newDataset && state.record.newDataset.isCreating;
    const creationError =
        state.record.newDataset && state.record.newDataset.error;
    const lastDatasetId =
        !isCreating &&
        state.record.newDataset &&
        state.record.newDataset.dataset &&
        state.record.newDataset.dataset.id;
    return { isCreating, creationError, lastDatasetId };
}

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            createRecord: createRecord
        },
        dispatch
    );
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(NewDataset);

function trimExtension(filename: string) {
    return filename.substr(0, filename.lastIndexOf(".")) || filename;
}

function turnPunctuationToSpaces(filename: string) {
    return filename.replace(PUNCTUATION_REGEX, " ");
}

function toTitleCase(str: string) {
    return str.replace(/\w\S*/g, function(txt) {
        return (
            txt.charAt(0).toUpperCase() +
            txt
                .substr(1)
                .replace(/([a-z])([A-Z])/g, "$1 $2")
                .toLowerCase()
        );
    });
}

function readFileAsArrayBuffer(file: any): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        var fileReader = new FileReader();
        fileReader.onload = function() {
            resolve(this.result as ArrayBuffer);
        };
        fileReader.readAsArrayBuffer(file);
    });
}

function humanFileSize(bytes, si) {
    var thresh = si ? 1000 : 1024;
    if (Math.abs(bytes) < thresh) {
        return bytes + " B";
    }
    var units = si
        ? ["kB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]
        : ["KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"];
    var u = -1;
    do {
        bytes /= thresh;
        ++u;
    } while (Math.abs(bytes) >= thresh && u < units.length - 1);
    return bytes.toFixed(1) + " " + units[u];
}

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

const PUNCTUATION_REGEX = /[-_]+/g;
