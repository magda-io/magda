import React from "react";

import { AlwaysEditor } from "Components/Editing/AlwaysEditor";
import {
    multilineTextEditor,
    multiTextEditorEx
} from "Components/Editing/Editors/textEditor";
import { codelistRadioEditor } from "Components/Editing/Editors/codelistEditor";
import * as codelists from "constants/DatasetConstants";
import {
    Dataset,
    DatasetPublishing,
    Provenance
} from "Components/Dataset/Add/DatasetAddCommon";
import OrganisationAutoComplete from "./OrganisationAutocomplete";
import OrgUnitDropdown from "./OrgUnitDropdown";

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

type Props = {
    edit: (aspectField: string) => (field: string) => (newValue: any) => void;
    dataset: Dataset;
    provenance: Provenance;
    publishing: DatasetPublishing;
};

export default function DatasetAddPeoplePage({
    dataset,
    provenance,
    publishing,
    edit
}: Props) {
    const editDataset = edit("dataset");
    const editPublishing = edit("datasetPublishing");
    const editProvenance = edit("provenance");

    return (
        <div className="row people-and-production-page">
            <div className="col-sm-12">
                <h2>People and production</h2>
                <hr />
                <h3>People</h3>
                <h4>
                    Which organisation is responsible for publishing this
                    dataset?
                </h4>
                <div>
                    <OrganisationAutoComplete
                        defaultValue={dataset.publisher}
                        onOrgSelected={editDataset("publisher")}
                    />
                </div>
                <h4>Which team is responsible for maintaining this dataset?</h4>
                <div>
                    <OrgUnitDropdown
                        orgUnitId={dataset.owningOrgUnitId}
                        onChange={editDataset("owningOrgUnitId")}
                    />
                </div>
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
                <hr />
                <h3>Production</h3>
                <h4>
                    Was this dataset produced in collaboration with with other
                    organisations?
                </h4>
                <div>
                    <YesNoEditReveal
                        value={provenance.affiliatedOrganizationIds}
                        defaultValue={[]}
                        nullValue={null}
                        onChange={editProvenance("affiliatedOrganizationIds")}
                    >
                        <AlwaysEditor
                            value={provenance.affiliatedOrganizationIds}
                            onChange={editProvenance(
                                "affiliatedOrganizationIds"
                            )}
                            editor={multiTextEditorEx({
                                placeholder: "Add an organisation"
                            })}
                        />
                    </YesNoEditReveal>
                </div>
                <h4>How was this dataset produced?</h4>
                <div>
                    <AlwaysEditor
                        value={provenance.mechanism}
                        onChange={editProvenance("mechanism")}
                        editor={multilineTextEditor}
                    />
                </div>
                <h4>What system was used to create this dataset?</h4>
                <div>
                    <AlwaysEditor
                        value={provenance.sourceSystem}
                        onChange={editProvenance("sourceSystem")}
                        editor={multilineTextEditor}
                    />
                </div>
                <h4>What was the source of this data?</h4>
                <div>
                    <AlwaysEditor
                        value={provenance.derivedFrom}
                        onChange={editProvenance("derivedFrom")}
                        editor={multiTextEditorEx({
                            placeholder: "Enter a dataset id"
                        })}
                    />
                </div>
            </div>
        </div>
    );
}
