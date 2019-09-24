import React from "react";

import { query } from "api-clients/VocabularyApis";
import MultiSelectAutoComplete from "Components/Editing/MultiSelectAutocomplete";
import { KeywordsLike } from "Components/Dataset/Add/DatasetAddCommon";

interface TagInputProps {
    placeHolderText?: string;
    value?: KeywordsLike | undefined;
    onChange: (value?: KeywordsLike) => void;
    useVocabularyAutoCompleteInput?: boolean;
}

export default (props: TagInputProps) => {
    return (
        <MultiSelectAutoComplete<string>
            placeHolderText={props.placeHolderText}
            value={props.value && props.value.keywords}
            onChange={newKeywords =>
                props.onChange(
                    newKeywords
                        ? {
                              derived: !!props.value && props.value.derived,
                              keywords: newKeywords
                          }
                        : undefined
                )
            }
            query={props.useVocabularyAutoCompleteInput ? query : undefined}
            fromData={data => data.value}
            toData={string => ({ label: string, value: string })}
        />
    );
};
