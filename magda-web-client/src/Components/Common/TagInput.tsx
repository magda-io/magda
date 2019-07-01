import React, { FunctionComponent } from "react";
import "./TagInput.scss";
import VocabularyAutoCompleteInput from "../Editing/VocabularyAutoCompleteInput";
import dismissIcon from "../../assets/dismiss-white.svg";

interface TagInputProps {
    placeHolderText?: string;
    value?: string[] | undefined;
    onChange?: (value: string[]) => void;
}

const TagInput: FunctionComponent<TagInputProps> = props => {
    const value: string[] =
        props.value && Array.isArray(props.value) ? props.value : [];
    const placeHolderText: string = props.placeHolderText
        ? props.placeHolderText
        : "Type a tag and press ENTER...";
    return (
        <div className="TagInputContainer">
            {value.map((item, idx) => (
                <button
                    key={idx}
                    className="au-btn tag-item"
                    onClick={() => {
                        debugger;
                        if (typeof props.onChange !== "function") return;
                        props.onChange(value.filter(v => v !== item));
                    }}
                >
                    <img src={dismissIcon} />
                    <div className="label">{item}</div>
                </button>
            ))}
            <div className="input-container">
                <VocabularyAutoCompleteInput
                    className="au-text-input tag-input"
                    onNewTag={newTagValue => {
                        if (typeof props.onChange !== "function") return;
                        if (value.indexOf(newTagValue) !== -1) return;
                        const newValue = [...value];
                        newValue.push(newTagValue);
                        props.onChange(newValue);
                    }}
                    placeholder={placeHolderText}
                />
            </div>
        </div>
    );
};

export default TagInput;
