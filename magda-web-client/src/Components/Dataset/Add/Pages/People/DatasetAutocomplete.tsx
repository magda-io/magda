import React from "react";
import debouncePromise from "debounce-promise";

import { searchDatasets } from "api-clients/SearchApis";
import { DatasetAutocompleteChoice } from "../../DatasetAddCommon";
import ASyncCreatableSelect from "react-select/async-creatable";
import ReactSelectStyles from "Components/Common/react-select/ReactSelectStyles";

type Props = {
    onDatasetSelected: (
        choices: DatasetAutocompleteChoice[] | undefined
    ) => void;
    value?: DatasetAutocompleteChoice[];
};

type Choice = {
    value: string;
    label: string;
    existingId: string;
};

function fromReactSelect(choice: Choice): DatasetAutocompleteChoice {
    return {
        existingId: choice.existingId,
        name: choice.label
    };
}

function toReactSelectValue(choice: DatasetAutocompleteChoice): Choice {
    return {
        existingId: choice.existingId,
        value: choice.existingId || choice.name,
        label: choice.name
    };
}

export default function OrganisationAutocomplete(props: Props) {
    const query: (term: string) => Promise<Choice[]> = debouncePromise(
        async (term: string) => {
            const apiResult = await searchDatasets({ q: term });

            return apiResult.dataSets.map(option => ({
                existingId: option.identifier,
                value: option.identifier,
                label: option.title
            }));
        },
        200
    );

    return (
        <ASyncCreatableSelect
            className="react-select"
            isMulti={true}
            isSearchable={true}
            onChange={rawValue => {
                if (!rawValue) {
                    props.onDatasetSelected(undefined);
                } else {
                    props.onDatasetSelected(
                        (rawValue as Choice[]).map(fromReactSelect)
                    );
                }
            }}
            styles={ReactSelectStyles}
            value={
                props.value ? props.value!.map(toReactSelectValue) : props.value
            }
            loadOptions={query}
            placeholder="Search for dataset"
        />
    );
}
