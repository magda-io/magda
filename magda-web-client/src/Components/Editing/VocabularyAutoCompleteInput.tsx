import React from "react";

import { query } from "api-clients/VocabularyApis";
import AutoCompleteInput, { InputProps } from "./AutoCompleteInput";

type Props = {
    suggestionSize?: number;
    onNewTag: (tag: string) => void;
    excludeKeywords: string[];
    inputProps?: InputProps<string>;
};

async function safeQuery(term: string): Promise<string[]> {
    const result = await query(term);
    return result || [];
}

export default function VocabularyAutoCompleteInput(props: Props) {
    const { excludeKeywords } = props;

    return (
        <AutoCompleteInput<string>
            suggestionSize={props.suggestionSize}
            query={safeQuery}
            objectToString={x => x}
            onSuggestionSelected={props.onNewTag}
            onTypedValueSelected={props.onNewTag}
            exclude={excludeKeywords}
            inputProps={props.inputProps}
        />
    );
}
