import React from "react";

import { query } from "api-clients/VocabularyApis";
import MultiSelectAutoComplete from "Components/Editing/MultiSelectAutocomplete";

interface TagInputProps {
    placeHolderText?: string;
    value?: string[] | undefined;
    onChange: (value?: string[]) => void;
    useVocabularyAutoCompleteInput?: boolean;
}

export default (props: TagInputProps) => {
    return (
        <MultiSelectAutoComplete<string>
            placeHolderText={props.placeHolderText}
            value={props.value}
            onChange={props.onChange}
            query={props.useVocabularyAutoCompleteInput ? query : undefined}
            fromData={data => data.value}
            toData={string => ({ label: string, value: string })}
        />
    );
};
