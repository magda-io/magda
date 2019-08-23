import React from "react";
import debouncePromise from "debounce-promise";
import ASyncCreatableSelect from "react-select/async-creatable";
import CreatableSelect from "react-select/creatable";
import { query } from "api-clients/VocabularyApis";

import ReactSelectStyles from "../Common/react-select/ReactSelectStyles";
import CustomMultiValueRemove from "../Common/react-select/CustomMultiValueRemove";

import "./TagInput.scss";

interface TagInputProps {
    placeHolderText?: string;
    value?: string[] | undefined;
    onChange: (value: string[]) => void;
    useVocabularyAutoCompleteInput?: boolean;
}

export default (props: TagInputProps) => {
    const loadOptions = debouncePromise(async (inputValue: string) => {
        return (await query(inputValue)).map(string => ({
            value: string,
            label: string
        }));
    }, 200);

    const commonProperties = {
        className: "react-select",
        isMulti: true,
        isSearchable: true,
        components: {
            MultiValueRemove: CustomMultiValueRemove
        },
        onChange: values =>
            props.onChange(
                Array.isArray(values) ? values.map(item => item.value) : []
            ),
        styles: ReactSelectStyles,
        value:
            props.value &&
            props.value.map(string => ({ value: string, label: string }))
    };

    return props.useVocabularyAutoCompleteInput ? (
        <ASyncCreatableSelect loadOptions={loadOptions} {...commonProperties} />
    ) : (
        <CreatableSelect {...commonProperties} />
    );
};
