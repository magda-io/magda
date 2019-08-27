import React from "react";
import debouncePromise from "debounce-promise";

import { autocompletePublishers } from "api-clients/SearchApis";
import { OrganisationAutocompleteChoice } from "../../DatasetAddCommon";
import ASyncCreatableSelect from "react-select/async-creatable";
import ReactSelectStyles from "Components/Common/react-select/ReactSelectStyles";

type Props =
    | {
          onOrgSelected: (
              choice: OrganisationAutocompleteChoice | undefined
          ) => void;
          value?: OrganisationAutocompleteChoice;
          multi: false;
      }
    | {
          onOrgSelected: (
              choices: OrganisationAutocompleteChoice[] | undefined
          ) => void;
          value?: OrganisationAutocompleteChoice[];
          multi: true;
      };

type Choice = {
    value: string;
    label: string;
    existingId?: string;
};

function fromReactSelect(choice: Choice) {
    return {
        existingId: choice.existingId,
        name: choice.label
    };
}

function toReactSelectValue(choice: OrganisationAutocompleteChoice): Choice {
    return {
        existingId: choice.existingId,
        value: choice.existingId || choice.name,
        label: choice.name
    };
}

export default function OrganisationAutocomplete(props: Props) {
    console.log(props);

    const query: (term: string) => Promise<Choice[]> = debouncePromise(
        async (term: string) => {
            const apiResult = await autocompletePublishers({}, term);

            return apiResult.options.map(option => ({
                existingId: option.identifier,
                value: option.identifier,
                label: option.value
            }));
        },
        200
    );

    return (
        <ASyncCreatableSelect
            className="react-select"
            isMulti={props.multi}
            isSearchable={true}
            onChange={(rawValue, action) => {
                if (!rawValue) {
                    props.onOrgSelected(undefined);
                } else if (props.multi) {
                    props.onOrgSelected(
                        (rawValue as Choice[]).map(fromReactSelect)
                    );
                } else {
                    props.onOrgSelected(fromReactSelect(rawValue as Choice));
                }
            }}
            styles={ReactSelectStyles}
            value={
                props.value
                    ? props.multi
                        ? props.value!.map(toReactSelectValue)
                        : toReactSelectValue(props.value!)
                    : props.value
            }
            loadOptions={query}
            placeholder="Search for an organisation"
        />
    );
}
