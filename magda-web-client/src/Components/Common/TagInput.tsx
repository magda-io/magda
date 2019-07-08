import React, { FunctionComponent, useState } from "react";
import "./TagInput.scss";
import VocabularyAutoCompleteInput from "../Editing/VocabularyAutoCompleteInput";
import dismissIcon from "../../assets/dismiss-white.svg";

interface SelfManagedTextInputProps {
    className?: string;
    onNewTag: (tag: string) => void;
    placeholder?: string;
}

const SelfManagedTextInput: FunctionComponent<
    SelfManagedTextInputProps
> = props => {
    const [textInputValue, setTextInputValue] = useState("");
    const { onNewTag, ...restProps } = props;
    return (
        <input
            type="text"
            {...restProps}
            value={textInputValue}
            onChange={event => {
                const value = (event.currentTarget as HTMLInputElement).value;
                setTextInputValue(value);
            }}
            onKeyUp={event => {
                const value = (event.currentTarget as HTMLInputElement).value.trim();
                if (event.keyCode === 13 && value !== "") {
                    setTextInputValue("");
                    if (typeof props.onNewTag === "function") {
                        props.onNewTag(value);
                    }
                }
            }}
        />
    );
};

interface TagInputProps {
    placeHolderText?: string;
    value?: string[] | undefined;
    onChange?: (value: string[]) => void;
    useVocabularyAutoCompleteInput?: boolean;
}

const TagInput: FunctionComponent<TagInputProps> = props => {
    const useVocabularyAutoCompleteInput = props.useVocabularyAutoCompleteInput
        ? true
        : false;
    const value: string[] =
        props.value && Array.isArray(props.value) ? props.value : [];
    const placeHolderText: string = props.placeHolderText
        ? props.placeHolderText
        : "Type a tag and press ENTER...";

    const onNewTag = newTagValue => {
        if (typeof props.onChange !== "function") return;
        if (value.indexOf(newTagValue) !== -1) return;
        const newValue = [...value];
        newValue.push(newTagValue);
        props.onChange(newValue);
    };

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
                {useVocabularyAutoCompleteInput ? (
                    <VocabularyAutoCompleteInput
                        className="au-text-input tag-input"
                        onNewTag={onNewTag}
                        placeholder={placeHolderText}
                    />
                ) : (
                    <SelfManagedTextInput
                        className="au-text-input tag-input"
                        onNewTag={onNewTag}
                        placeholder={placeHolderText}
                    />
                )}
            </div>
        </div>
    );
};

export default TagInput;
