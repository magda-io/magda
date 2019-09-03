import React from "react";
import debouncePromise from "debounce-promise";

import { searchDatasets } from "api-clients/SearchApis";
import {
    DatasetAutocompleteChoice,
    saveState,
    createBlankState
} from "../../DatasetAddCommon";
import ASyncSelect, { Async } from "react-select/async";
import ReactSelectStyles from "Components/Common/react-select/ReactSelectStyles";
import { OptionProps } from "react-select/src/components/Option";
import { components } from "react-select";
import { User } from "reducers/userManagementReducer";

type Props = {
    onDatasetSelected: (
        choices: DatasetAutocompleteChoice[] | undefined
    ) => void;
    value?: DatasetAutocompleteChoice[];
    user: User;
};

type Choice = {
    value: string;
    label: string;
    existingId?: string;
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

const CustomOption = (props: OptionProps<Choice>) => (
    <components.Option
        {...props}
        innerProps={{
            ...props.innerProps,
            onClick: event => {
                if (props.data.onClick) {
                    props.innerRef;
                    props.data.onClick(event);
                } else {
                    props.innerProps.onClick(event);
                }
            }
        }}
    />
);

export default function OrganisationAutocomplete(props: Props) {
    let selectRef = React.createRef<Async<Choice>>();

    const query: (term: string) => Promise<any> = debouncePromise(
        async (term: string) => {
            const apiResult = await searchDatasets({ q: term, limit: 4 });

            const result = await apiResult.dataSets.map(option => ({
                existingId: option.identifier,
                value: option.identifier,
                label: option.title
            }));

            return [
                {
                    label: "Existing datasets in your catalog",
                    options: result
                },
                {
                    label: "Add this as a new dataset to your catalog",
                    options: [
                        {
                            label: `Add new: "${term}"`,
                            onClick: () => {
                                selectRef.current && selectRef.current.blur();
                                const newDatasetState = createBlankState(
                                    props.user
                                );
                                newDatasetState.dataset.title = term;
                                const newDatasetId = saveState(newDatasetState);
                                const newChoice = {
                                    existingId: newDatasetId,
                                    name: term
                                };
                                props.onDatasetSelected(
                                    props.value
                                        ? [...props.value, newChoice]
                                        : [newChoice]
                                );
                            }
                        }
                    ]
                },
                {
                    label: "Don't add anything for now",
                    options: [
                        {
                            label: `Use name: "${term}"`,
                            onClick: () => {
                                selectRef.current && selectRef.current.blur();
                                console.log("goodbye");
                            }
                        }
                    ]
                }
            ];
        },
        200
    );

    return (
        <ASyncSelect
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
            components={{
                Option: CustomOption
            }}
            ref={selectRef}
        />
    );
}
