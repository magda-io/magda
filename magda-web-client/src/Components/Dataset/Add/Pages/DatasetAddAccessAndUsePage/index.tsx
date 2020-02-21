import React from "react";

import ToolTip from "Components/Dataset/Add/ToolTip";
import { AlwaysEditor } from "Components/Editing/AlwaysEditor";
import { MultilineTextEditor } from "Components/Editing/Editors/textEditor";
import { codelistRadioEditor } from "Components/Editing/Editors/codelistEditor";
import LicenseEditor from "Components/Dataset/Add/LicenseEditor";

import AccessLocationAutoComplete from "./AccessLocationAutoComplete";

import { State } from "Components/Dataset/Add/DatasetAddCommon";
import * as codelists from "constants/DatasetConstants";

import { getFormatIcon } from "../../../View/DistributionIcon";
import helpIcon from "assets/help.svg";

import ReactSelectOriginal from "react-select";
import ValidationHoc from "Components/Common/react-select/ValidationHoc";
import PurpleToolTip from "Components/Common/TooltipWrapper";
import { config } from "config";

import ValidationRequiredLabel from "../../ValidationRequiredLabel";

import "./index.scss";

//--- Added Validation Support to ReactSelect
const ReactSelect = ValidationHoc(ReactSelectOriginal);

type Props = {
    edit: <K extends keyof State>(
        aspectField: K
    ) => (field: string) => (newValue: any) => void;
    editState: <K extends keyof State>(field: K) => (newValue: any) => void;
    stateData: State;
};

export default function DatasetAddAccessAndUsePage(props: Props) {
    let {
        distributions,
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
                            placeholder="Enter any access considerations for users, such as permissions or restrictions they should be aware of..."
                            onChange={editDatasetAccess("notes")}
                        />
                    </div>
                </div>

                <h3 className="with-underline">Dataset use</h3>

                {distributions.length !== 0 && (
                    <div className="question-license-apply-type">
                        <h4>
                            What type of licence should be applied to these
                            distributions?
                        </h4>

                        <ToolTip>
                            By default, Magda adds Licenses at the Dataset Level
                            (i.e. to all distributions), but this can be
                            overriden to apply at a Distribution (each file or
                            URL) level if desired.
                        </ToolTip>

                        <div className="row">
                            <div className="col-sm-4">
                                <ReactSelect
                                    validationFieldPath="$.licenseLevel"
                                    validationFieldLabel="Licence Type"
                                    className="license-apply-type-select"
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
                                    onChange={(item: any) =>
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
                    <h4>
                        What licence restrictions should be applied?
                        <ValidationRequiredLabel validationFieldPath="$.dataset.defaultLicense" />
                    </h4>
                    <ToolTip>
                        We recommend a Whole of Government Licence be applied to
                        encourage inter-department data sharing in the future.
                    </ToolTip>
                    {licenseLevel === "dataset" ? (
                        <div className="license-dataset-option-container row">
                            <div className="col-sm-6">
                                <LicenseEditor
                                    validationFieldPath="$.dataset.defaultLicense"
                                    validationFieldLabel="Dataset Level Licence"
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
                            {distributions.map((file, fileIndex) => {
                                const edit = field => value => {
                                    file[field] = value;
                                    props.editState("distributions")(
                                        distributions
                                    );
                                };
                                return (
                                    <div className="fileBlock">
                                        <div className="fileBlock-file">
                                            <span className="fileBlock-icon">
                                                <img
                                                    className="file-icon"
                                                    src={getFormatIcon(file)}
                                                />
                                            </span>
                                            <span className="fileBlock-text">
                                                {file.title}
                                            </span>
                                        </div>
                                        <div className="fileBlock-control">
                                            <LicenseEditor
                                                validationFieldPath={`$.distributions[${fileIndex}].license`}
                                                validationFieldLabel="Distribution Licence"
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
                    <h4>
                        <span>
                            What is the sensitivity or security classification
                            of this dataset?
                            <ValidationRequiredLabel validationFieldPath="$.informationSecurity.classification" />
                        </span>
                        <span className="tooltip-container">
                            <PurpleToolTip
                                className="tooltip no-print"
                                launcher={() => (
                                    <div className="tooltip-launcher-icon help-icon">
                                        <img
                                            src={helpIcon}
                                            alt="Security classifications, click for more information"
                                        />
                                    </div>
                                )}
                                innerElementClassName="inner"
                            >
                                {() => (
                                    <>
                                        Magda security classification refers to
                                        the Attorney-General Department’s
                                        Sensitive and Classification policy. It
                                        is important that the appropriate
                                        security classification level is
                                        selected to protect the confidentiality,
                                        integrity and availability of the data.
                                        The framework is as follows:{" "}
                                        <a
                                            target="_blank"
                                            href="/page/security-classification"
                                        >
                                            {config.baseExternalUrl}
                                            page/security-classification
                                        </a>
                                    </>
                                )}
                            </PurpleToolTip>
                        </span>
                    </h4>
                    <div className="row">
                        <div className="col-sm-6">
                            <ReactSelect
                                validationFieldPath="$.informationSecurity.classification"
                                validationFieldLabel="Dataset Sensitivity or Security Classification"
                                isSearchable={false}
                                options={
                                    Object.keys(codelists.classification).map(
                                        key => ({
                                            label:
                                                codelists.classification[key],
                                            value: key
                                        })
                                    ) as any
                                }
                                value={
                                    informationSecurity.classification
                                        ? {
                                              label:
                                                  codelists.classification[
                                                      informationSecurity
                                                          .classification
                                                  ],
                                              value:
                                                  informationSecurity.classification
                                          }
                                        : null
                                }
                                onChange={(item: any) =>
                                    editInformationSecurity("classification")(
                                        item.value
                                    )
                                }
                            />
                        </div>
                    </div>
                    {informationSecurity.classification === "PROTECTED" ? (
                        <div className="row">
                            <div className="col-sm-12">
                                <div className="au-page-alerts au-page-alerts--warning">
                                    <div>
                                        Protected datasets must be stored within
                                        the Protected Enclave
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                    {informationSecurity.classification === "SECRET" ||
                    informationSecurity.classification === "TOP SECRET" ? (
                        <div className="row">
                            <div className="col-sm-12">
                                <div className="au-page-alerts au-page-alerts--warning">
                                    <div>
                                        Secret or Top Secret classified data
                                        must not be stored on any departmental
                                        network, and must be managed as a
                                        physical asset
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
                {informationSecurity.classification === "OFFICIAL:SENSITIVE" ? (
                    <div className="question-sensitivity">
                        <h4>
                            <span>
                                What sensitivity markers should be added to this
                                dataset?
                                <ValidationRequiredLabel validationFieldPath="$.informationSecurity.disseminationLimits" />
                            </span>
                            <span className="tooltip-container">
                                <PurpleToolTip
                                    className="tooltip no-print"
                                    launcher={() => (
                                        <div className="tooltip-launcher-icon help-icon">
                                            <img
                                                src={helpIcon}
                                                alt="Security classifications, click for more information"
                                            />
                                        </div>
                                    )}
                                    innerElementClassName="inner"
                                >
                                    {() => (
                                        <>
                                            Visit this page for more detail on
                                            Access Restrictions - Information
                                            Management Markers:{" "}
                                            <a
                                                target="_blank"
                                                href="https://www.protectivesecurity.gov.au/information/sensitive-classified-information/Pages/default.aspx"
                                            >
                                                https://www.protectivesecurity.gov.au/information/sensitive-classified-information/Pages/default.aspx
                                            </a>
                                        </>
                                    )}
                                </PurpleToolTip>
                            </span>
                        </h4>
                        <div className="row">
                            <div className="col-sm-8">
                                <ReactSelect
                                    validationFieldPath="$.informationSecurity.disseminationLimits"
                                    validationFieldLabel="Dataset Sensitivity Markers"
                                    isSearchable={false}
                                    isMulti={true}
                                    options={
                                        Object.keys(
                                            codelists.disseminationLimits
                                        ).map(key => ({
                                            label:
                                                codelists.disseminationLimits[
                                                    key
                                                ],
                                            value: key
                                        })) as any
                                    }
                                    value={
                                        informationSecurity.disseminationLimits &&
                                        informationSecurity.disseminationLimits
                                            .length
                                            ? informationSecurity.disseminationLimits.map(
                                                  item => ({
                                                      label:
                                                          codelists
                                                              .disseminationLimits[
                                                              item
                                                          ],
                                                      value: item
                                                  })
                                              )
                                            : []
                                    }
                                    onChange={(items: any) =>
                                        editInformationSecurity(
                                            "disseminationLimits"
                                        )(items.map(item => item.value))
                                    }
                                />
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
