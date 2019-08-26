import React from "react";

import ToolTip from "Components/Dataset/Add/ToolTip";
import { AlwaysEditor } from "Components/Editing/AlwaysEditor";
import { MultilineTextEditor } from "Components/Editing/Editors/textEditor";
import {
    codelistEditor,
    codelistRadioEditor,
    multiCodelistEditor
} from "Components/Editing/Editors/codelistEditor";
import LicenseEditor from "Components/Dataset/Add/LicenseEditor";

import AccessLocationAutoComplete from "./AccessLocationAutoComplete";

import { State } from "Components/Dataset/Add/DatasetAddCommon";
import * as codelists from "constants/DatasetConstants";

import { getFormatIcon } from "../../../View/DistributionIcon";
import helpIcon from "assets/help.svg";

import ReactSelect from "react-select";
import ReactSelectStyles from "../../../../Common/react-select/ReactSelectStyles";

import "./index.scss";

type Props = {
    edit: <K extends keyof State>(
        aspectField: K
    ) => (field: string) => (newValue: any) => void;
    editState: <K extends keyof State>(field: K) => (newValue: any) => void;
    stateData: State;
};

export default function DatasetAddAccessAndUsePage(props: Props) {
    let {
        files,
        dataset,
        datasetAccess,
        licenseLevel,
        datasetPublishing,
        informationSecurity
    } = props.stateData;

    const editDatasetPublishing = props.edit("datasetPublishing");
    const editDatasetAccess = props.edit("datasetAccess");
    const editInformationSecurity = props.edit("informationSecurity");

    return (
        <div className="row dataset-access-and-use-page">
            <div className="col-sm-12">
                <h2>Access and Use</h2>
                <h3 className="with-underline">User access</h3>
                <div className="question-who-can-see-dataset">
                    <h4 className="with-icon">
                        <span>
                            Who can see the dataset once it is published?
                        </span>
                        <span className="help-icon-container">
                            <img src={helpIcon} />
                        </span>
                    </h4>
                    <ToolTip>
                        We recommend you publish your data to everyone in your
                        organisation to help prevent data silos.
                    </ToolTip>
                    <div>
                        <AlwaysEditor
                            value={datasetPublishing.level}
                            onChange={editDatasetPublishing("level")}
                            editor={codelistRadioEditor(
                                "dataset-publishing-level",
                                codelists.publishingLevel
                            )}
                        />
                    </div>
                </div>

                <div className="question-access-notes">
                    <h4>Where can users access this dataset from?</h4>
                    <ToolTip>
                        Select the best location for this dataset based on its
                        contents and your organisation file structure.
                    </ToolTip>
                    <h4>Dataset location:</h4>
                    <div className="access-location-input-container">
                        <AccessLocationAutoComplete
                            placeholder="Start typing a file location name..."
                            defaultValue={
                                datasetAccess.location
                                    ? datasetAccess.location
                                    : ""
                            }
                            onChange={editDatasetAccess("location")}
                        />
                    </div>
                    <h4>Dataset access notes:</h4>
                    <div>
                        <MultilineTextEditor
                            value={datasetAccess.notes}
                            placerHolder="Enter any access considerations for users, such as permissions or restrictions they should be aware of..."
                            onChange={editDatasetAccess("notes")}
                        />
                    </div>
                </div>

                <h3 className="with-underline">Dataset use</h3>

                {files.length !== 0 && (
                    <div className="question-license-apply-type">
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

                        <div className="row">
                            <div className="col-sm-4">
                                <ReactSelect
                                    className="license-apply-type-select"
                                    styles={ReactSelectStyles}
                                    isSearchable={false}
                                    options={
                                        Object.keys(
                                            codelists.datasetLicenseLevel
                                        ).map(key => ({
                                            label:
                                                codelists.datasetLicenseLevel[
                                                    key
                                                ],
                                            value: key
                                        })) as any
                                    }
                                    value={
                                        licenseLevel
                                            ? {
                                                  label:
                                                      codelists
                                                          .datasetLicenseLevel[
                                                          licenseLevel
                                                      ],
                                                  value: licenseLevel
                                              }
                                            : null
                                    }
                                    onChange={item =>
                                        props.editState("licenseLevel")(
                                            item.value
                                        )
                                    }
                                />
                            </div>
                        </div>
                    </div>
                )}

                <div className="question-license-restriction-type">
                    <h4>What license restrictions should be applied?</h4>
                    <ToolTip>
                        We recommend a Whole of Government License be applied to
                        encourage inter-department data sharing in the future.
                    </ToolTip>
                    {licenseLevel === "dataset" ? (
                        <div className="license-dataset-option-container row">
                            <div className="col-sm-6">
                                <LicenseEditor
                                    value={dataset.defaultLicense || ""}
                                    onChange={license => {
                                        props.editState("dataset")({
                                            ...dataset,
                                            defaultLicense: license
                                        });
                                    }}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="license-distribution-option-container">
                            {files.map((file, fileIndex) => {
                                const edit = field => value => {
                                    file[field] = value;
                                    props.editState("files")(files);
                                };
                                return (
                                    <div className="fileBlock">
                                        <span className="fileBlock-icon">
                                            <img
                                                className="file-icon"
                                                src={getFormatIcon(file)}
                                            />
                                        </span>
                                        <span className="fileBlock-text">
                                            {file.title}
                                        </span>
                                        <div className="fileBlock-control col-sm-6">
                                            <LicenseEditor
                                                value={file.license || ""}
                                                onChange={edit("license")}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="question-security-classification">
                    <h4 className="with-icon">
                        <span>
                            What is the security classification of this dataset?
                        </span>
                        <span className="help-icon-container">
                            <img src={helpIcon} />
                        </span>
                    </h4>
                    <div>
                        <AlwaysEditor
                            value={informationSecurity.classification}
                            onChange={editInformationSecurity("classification")}
                            editor={codelistEditor(codelists.classification)}
                        />
                    </div>
                </div>

                <div className="question-security-classification">
                    <h4 className="with-icon">
                        <span>What is the sensitivity of this dataset?</span>
                        <span className="help-icon-container">
                            <img src={helpIcon} />
                        </span>
                    </h4>
                    <div>
                        <AlwaysEditor
                            value={informationSecurity.disseminationLimits}
                            onChange={editInformationSecurity(
                                "disseminationLimits"
                            )}
                            editor={multiCodelistEditor(
                                codelists.disseminationLimits
                            )}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
