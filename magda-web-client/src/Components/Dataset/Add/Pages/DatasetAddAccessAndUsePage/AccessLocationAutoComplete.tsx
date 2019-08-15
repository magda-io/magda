import React from "react";

import { autoCompleteAccessLocation } from "api-clients/SearchApis";
import AutoCompleteInput from "Components/Editing/AutoCompleteInput";

import "./AccessLocationAutoComplete.scss";
import editIcon from "assets/edit.svg";

type Props = {
    onChange: (value: string) => void;
    defaultValue?: string;
};

async function query(term: string) {
    return await autoCompleteAccessLocation(term);
}

export default function OrganisationAutocomplete(props: Props) {
    const { onChange, defaultValue } = props;
    return (
        <div className="access-location-auto-complete-input-outer-container common-auto-complete-input-outer-container">
            <img className="edit-icon" src={editIcon} />
            <AutoCompleteInput<string>
                suggestionSize={8}
                query={query}
                objectToString={x => x}
                onSuggestionSelected={onChange}
                onTypedValueSelected={onChange}
                defaultValue={defaultValue}
                emptyOnSelect={false}
                inputProps={{
                    placeholder: "Please Provide Access Location (Optional)...",
                    className:
                        "au-text-input tag-input common-auto-complete-input"
                }}
            />
        </div>
    );
}
