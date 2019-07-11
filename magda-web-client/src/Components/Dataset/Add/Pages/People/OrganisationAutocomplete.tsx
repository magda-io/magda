import React, { InputHTMLAttributes } from "react";

import { query } from "api-clients/VocabularyApis";
import AutoCompleteInput from "Components/Editing/AutoCompleteInput";

type Props = {
    suggestionSize?: number;
    onNewTag: (tag: string) => void;
    excludeKeywords: string[];
} & InputHTMLAttributes<HTMLInputElement>;

export default function OrganisationAutocomplete(props: Props) {
    const { suggestionSize, onNewTag, excludeKeywords, ...otherProps } = props;

    return (
        <AutoCompleteInput<string>
            suggestionSize={props.suggestionSize}
            query={query}
            objectToString={x => x}
            onSuggestionSelected={props.onNewTag}
            onTypedValueSelected={props.onNewTag}
            exclude={excludeKeywords}
            {...otherProps}
        />
    );
}
