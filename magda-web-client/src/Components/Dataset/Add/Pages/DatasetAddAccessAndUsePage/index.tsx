import React from "react";

import ToolTip from "Components/Dataset/Add/ToolTip";
import HelpSnippet from "Components/Common/HelpSnippet";
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
        datasetAccess,
        datasetLevelLicense,
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
                                value={licenseLevel}
                                onChange={value => {
                                    props.editState("licenseLevel")(value);
                                }}
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

                {licenseLevel === "dataset" ? (
                    <LicenseEditor
                        value={datasetLevelLicense || ""}
                        onChange={props.editState("datasetLevelLicense")}
                    />
                ) : (
                    <div>
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

                                    <div className="fileBlock-control">
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

                <h4>What is the security classification of this dataset?</h4>
                <p>
                    <AlwaysEditor
                        value={informationSecurity.classification}
                        onChange={editInformationSecurity("classification")}
                        editor={codelistEditor(codelists.classification)}
                    />
                </p>
                <h4 className="snippet-heading">
                    What is the sensitivity of this dataset?
                </h4>
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
                        value={informationSecurity.disseminationLimits}
                        onChange={editInformationSecurity(
                            "disseminationLimits"
                        )}
                        editor={multiCodelistEditor(
                            codelists.disseminationLimits
                        )}
                    />
                </p>
            </div>
        </div>
    );
}
