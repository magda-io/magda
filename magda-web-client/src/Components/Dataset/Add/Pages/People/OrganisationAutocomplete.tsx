import React from "react";

import { autocompletePublishers } from "api-clients/SearchApis";
import AutoCompleteInput from "Components/Editing/AutoCompleteInput";
import { OrganisationAutocompleteChoice } from "../../DatasetAddCommon";

type Props = {
    onOrgSelected: (choice: OrganisationAutocompleteChoice) => void;
    defaultValue?: OrganisationAutocompleteChoice;
};

async function query(term: string) {
    const apiResult = await autocompletePublishers({}, term);

    return apiResult.options.map(searchPublisher => ({
        name: searchPublisher.value,
        existingId: searchPublisher.identifier
    }));
}

export default function OrganisationAutocomplete(props: Props) {
    const { onOrgSelected, defaultValue } = props;

    const handleNewOrg = (orgName: string) => onOrgSelected({ name: orgName });

    return (
        <AutoCompleteInput<OrganisationAutocompleteChoice>
            suggestionSize={5}
            query={query}
            objectToString={x => x.name}
            onSuggestionSelected={props.onOrgSelected}
            onTypedValueSelected={handleNewOrg}
            defaultValue={defaultValue}
            emptyOnSelect={false}
            inputProps={{
                className: "au-text-input tag-input"
            }}
        />
    );
}
