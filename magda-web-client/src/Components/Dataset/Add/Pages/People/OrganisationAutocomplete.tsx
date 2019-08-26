import React from "react";
import debouncePromise from "debounce-promise";

import { autocompletePublishers } from "api-clients/SearchApis";
// import AutoCompleteInput from "Components/Editing/AutoCompleteInput";
import { OrganisationAutocompleteChoice } from "../../DatasetAddCommon";
import ASyncCreatableSelect from "react-select/async-creatable";
import ReactSelectStyles from "Components/Common/react-select/ReactSelectStyles";

// import editIcon from "assets/edit.svg";

type Props = {
    onOrgSelected: (choice: OrganisationAutocompleteChoice) => void;
    defaultValue?: OrganisationAutocompleteChoice;
};

type Choice = {
    value: string;
    label: string;
    existingId?: string;
};

export default function OrganisationAutocomplete(props: Props) {
    const query = debouncePromise(async (term: string) => {
        const apiResult = await autocompletePublishers({}, term);

        return apiResult.options.map(searchPublisher => ({
            label: searchPublisher.value,
            value: searchPublisher.identifier,
            existingId: searchPublisher.identifier
        }));
    }, 200);

    return (
        <ASyncCreatableSelect
            className="react-select"
            isMulti={false}
            isSearchable={true}
            onChange={(rawValue, action) => {
                const value = rawValue as (Choice | undefined | null);
                if (value) {
                    props.onOrgSelected({
                        existingId: value.existingId,
                        name: value.label
                    });
                }
            }}
            styles={ReactSelectStyles}
            defaultValue={
                props.defaultValue && {
                    value:
                        props.defaultValue.existingId ||
                        props.defaultValue.name,
                    label: props.defaultValue.name,
                    existingId: props.defaultValue.existingId
                }
            }
            loadOptions={query}
            placeholder="Search for an organisation"
        />
        // <div className="org-auto-complete-input-outer-container">
        //     <img className="edit-icon" src={editIcon} />
        //     <AutoCompleteInput<OrganisationAutocompleteChoice>
        //         suggestionSize={5}
        //         query={query}
        //         objectToString={x => x.name}
        //         onSuggestionSelected={props.onOrgSelected}
        //         onTypedValueSelected={handleNewOrg}
        //         defaultValue={defaultValue}
        //         emptyOnSelect={false}
        //         inputProps={{
        //             placeholder: "Search for an Organisation",
        //             className: "au-text-input tag-input org-auto-complete-input"
        //         }}
        //     />
        // </div>
    );
}
