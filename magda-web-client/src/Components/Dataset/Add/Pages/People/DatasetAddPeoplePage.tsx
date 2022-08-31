import React from "react";

import { AlwaysEditor } from "Components/Editing/AlwaysEditor";
import { multilineTextEditor } from "Components/Editing/Editors/textEditor";
import { codelistRadioEditor } from "Components/Editing/Editors/codelistEditor";
import * as codelists from "constants/DatasetConstants";
import {
    Dataset,
    DatasetPublishing,
    Provenance,
    State as AddMetadataState
} from "Components/Dataset/Add/DatasetAddCommon";
import OrganisationAutoComplete from "./OrganisationAutocomplete";
import DatasetAutoComplete from "./DatasetAutocomplete";
import ManagingOrgUnitDropdown from "./OrgUnitDropdown";
import OrgUnitDropDown from "../../OrgUnitDropDown";
import YesNoReveal from "../../YesNoReveal";

import ValidationRequiredLabel from "../../ValidationRequiredLabel";

import ToolTip from "Components/Dataset/Add/ToolTip";

import "./DatasetAddPeoplePage.scss";
import { User } from "reducers/userManagementReducer";

type Props = {
    edit: <K extends keyof AddMetadataState>(
        aspectField: K
    ) => (field: string) => (newValue: any) => void;
    dataset: Dataset;
    provenance: Provenance;
    publishing: DatasetPublishing;
    user: User;
    // --- if use as edit page
    isEditView: boolean;
};

export default function DatasetAddPeoplePage({
    dataset,
    provenance,
    publishing,
    edit,
    user
}: Props) {
    const editDataset = edit("dataset");
    const editPublishing = edit("datasetPublishing");
    const editProvenance = edit("provenance");

    return (
        <div className="row people-and-production-page">
            <div className="col-sm-12">
                <h2>People and production</h2>
                <h3>People</h3>
                <hr />
                <div>
                    <h4>
                        Which organisation is responsible for publishing this
                        dataset?
                        <ValidationRequiredLabel validationFieldPath="$.dataset.publisher" />
                    </h4>
                    <div>
                        <OrganisationAutoComplete
                            multi={false}
                            value={dataset.publisher}
                            onOrgSelected={editDataset("publisher")}
                            validationFieldPath="$.dataset.publisher"
                            validationFieldLabel="Responsible Organisation"
                        />
                    </div>
                </div>
                <div>
                    <h4>
                        Which area of the organisation should be referenced as
                        the data custodian?
                        <ValidationRequiredLabel validationFieldPath="$.datasetPublishing.custodianOrgUnitId" />
                    </h4>
                    <div>
                        <OrgUnitDropDown
                            orgUnitId={publishing?.custodianOrgUnitId}
                            onChange={editPublishing("custodianOrgUnitId")}
                            validationFieldPath="$.datasetPublishing.custodianOrgUnitId"
                            validationFieldLabel="Data Custodian"
                        />
                    </div>
                </div>

                <div>
                    <h4>
                        Which team is responsible for maintaining this dataset?
                        <ValidationRequiredLabel validationFieldPath="$.datasetPublishing.managingOrgUnitId" />
                    </h4>
                    <div>
                        <ManagingOrgUnitDropdown
                            orgUnitId={publishing.managingOrgUnitId}
                            custodianOrgUnitId={publishing?.custodianOrgUnitId}
                            onChange={editPublishing("managingOrgUnitId")}
                            validationFieldPath="$.datasetPublishing.managingOrgUnitId"
                            validationFieldLabel="Managing Team"
                        />
                    </div>
                </div>
                <div>
                    <h4>
                        How should the contact point(s) be referenced in the
                        metadata?
                    </h4>
                    <div>
                        <AlwaysEditor
                            value={publishing.contactPointDisplay}
                            onChange={editPublishing("contactPointDisplay")}
                            editor={codelistRadioEditor(
                                "dataset-contact-point-display",
                                codelists.contactPointDisplay
                            )}
                        />
                    </div>
                </div>
                <hr />
                <h3>Production</h3>
                <h4>How was this dataset produced?</h4>
                <ToolTip>
                    Briefly describe the methodology of producing this dataset
                    or any other information that might assist consumers of the
                    dataset.
                </ToolTip>
                <div>
                    <AlwaysEditor
                        value={provenance.mechanism}
                        onChange={editProvenance("mechanism")}
                        editor={multilineTextEditor}
                    />
                </div>
                <h4>What system (if any) was used to produce the data?</h4>
                <ToolTip>
                    For example, internal systems, external sources, etc.
                </ToolTip>
                <div>
                    <AlwaysEditor
                        value={provenance.sourceSystem}
                        onChange={editProvenance("sourceSystem")}
                        editor={multilineTextEditor}
                    />
                </div>
                <h4>
                    Was this dataset produced in collaboration with with other
                    organisations?
                </h4>
                <div>
                    <YesNoReveal
                        value={provenance.affiliatedOrganizations}
                        onChange={editProvenance("affiliatedOrganizations")}
                        name="affiliatedOrganizations"
                    >
                        <div className="affiliated-organizations__select-wrapper">
                            <OrganisationAutoComplete
                                multi={true}
                                value={provenance.affiliatedOrganizations}
                                onOrgSelected={editProvenance(
                                    "affiliatedOrganizations"
                                )}
                            />
                        </div>
                    </YesNoReveal>
                </div>
                <h4>What datasets (if any) was this data derived from?</h4>
                <ToolTip>
                    Derived data is obtained when you apply a process or
                    transformation to one or more source datasets. Understanding
                    how data is derived is useful in understanding the
                    provenance of a dataset.
                </ToolTip>
                <div>
                    <DatasetAutoComplete
                        user={user}
                        value={provenance.derivedFrom}
                        onDatasetSelected={editProvenance("derivedFrom")}
                    />
                </div>
            </div>
        </div>
    );
}
