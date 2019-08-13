import React, { ReactEventHandler, FunctionComponent } from "react";
import Editor from "./Editor";
import editIcon from "assets/edit.svg";

import { ListMultiItemEditor } from "./multiItem";

export type InputComponentParameter = React.ComponentType<{
    className?: string;
    defaultValue?: string;
    onChange?: ReactEventHandler;
    [k: string]: any;
}> | null;

export function textEditorEx(
    options: any = {},
    InputComponent: InputComponentParameter = null
) {
    return {
        edit: (
            value: any,
            onChange: Function,
            multiValues: any = null,
            extraProps: any = {}
        ) => {
            const callback = event => {
                onChange(event.target.value);
            };
            if (options.redrawOnEmpty && !value) {
                options.key = Math.random();
            }
            return InputComponent ? (
                <InputComponent
                    className={
                        options.fullWidth
                            ? "au-text-input full-width-ctrl textEditorEx"
                            : "au-text-input non-full-width-ctrl textEditorEx"
                    }
                    defaultValue={value as string}
                    onChange={callback}
                    {...options}
                    {...extraProps}
                />
            ) : (
                <div className="textEditorEx-outter-container">
                    <input
                        className={
                            options.fullWidth
                                ? "au-text-input full-width-ctrl textEditorEx"
                                : "au-text-input non-full-width-ctrl textEditorEx"
                        }
                        defaultValue={value as string}
                        onChange={callback}
                        {...options}
                        {...extraProps}
                    />
                    <div className="edit-icon-container">
                        <img className="edit-icon" src={editIcon} />
                    </div>
                </div>
            );
        },
        view: (value: any) => {
            return <React.Fragment>{value ? value : "NOT SET"}</React.Fragment>;
        }
    };
}

export const textEditor = textEditorEx({});
export const textEditorFullWidth = textEditorEx({ fullWidth: true });

interface MultilineTextEditorPropType {
    isEditorMode?: boolean;
    limit?: number;
    value?: string;
    placerHolder?: string;
    onChange?: (value: string) => void;
}

const wordsCount = (str: string): number => {
    if (typeof str !== "string" || !str) return 0;
    return str.trim().split(/\W+/).length;
};

// --- truncate by words count & preserve non-words chars parttern
// --- this is required by line breaks
const truncateByWordsCount = (str: string, limit: number): string => {
    const count = wordsCount(str);
    if (count <= limit) return str;

    const nonWords = str.trim().match(/\W+/g);
    const words = str.trim().split(/\W+/);
    if (!nonWords || !words.length) return str;

    const newStrItems: string[] = [];
    for (let i = 0; i < limit; i++) {
        if (i !== 0) newStrItems.push(nonWords[i - 1]);
        newStrItems.push(words[i]);
    }
    return newStrItems.join("");
};

export const MultilineTextEditor: FunctionComponent<
    MultilineTextEditorPropType
> = props => {
    const isEditorMode = props.isEditorMode === false ? false : true;
    const placerHolder = props.placerHolder ? props.placerHolder : "";
    const value = props.value ? props.value : "";
    const limit = props.limit ? props.limit : 0;

    return isEditorMode ? (
        <div className="multilineTextEditor-outter-container">
            <textarea
                className="au-text-input full-width-ctrl au-text-input--block"
                onChange={event => {
                    if (typeof props.onChange === "function") {
                        let inputValue = event.target.value
                            ? event.target.value
                            : "";
                        if (limit && wordsCount(inputValue) > limit) {
                            inputValue = truncateByWordsCount(
                                inputValue,
                                limit
                            );
                        }
                        props.onChange(inputValue);
                    }
                }}
                placeholder={placerHolder}
                value={props.value as string}
            />
            <div className="edit-icon-container">
                <img className="edit-icon" src={editIcon} />
            </div>
            {limit ? (
                <div className="word-count-row">
                    {(() => {
                        let count = limit - wordsCount(value);
                        return count < 0 ? 0 : count;
                    })()}{" "}
                    words remaining
                </div>
            ) : null}
        </div>
    ) : (
        <React.Fragment>{value ? value : "NOT SET"}</React.Fragment>
    );
};

export const multilineTextEditor: Editor<string> = {
    edit: (value: any, onChange: Function) => {
        const callback = event => {
            onChange(event.target.value);
        };
        return (
            <div className="multilineTextEditor-outter-container">
                <textarea
                    className="au-text-input full-width-ctrl au-text-input--block"
                    style={{ width: "100%" }}
                    onChange={callback}
                    defaultValue={value as string}
                />
                <div className="edit-icon-container">
                    <img className="edit-icon" src={editIcon} />
                </div>
            </div>
        ); //<input defaultValue={value as string} onChange={callback} />;
    },
    view: (value: any) => {
        return <React.Fragment>{value ? value : "NOT SET"}</React.Fragment>;
    }
};

export const multiTextEditor: Editor<string[]> = ListMultiItemEditor.create(
    textEditor,
    () => ""
);

export const multiTextEditorEx = (
    options,
    inputComponent: InputComponentParameter = null
) => {
    options.redrawOnEmpty =
        typeof options.redrawOnEmpty !== "boolean"
            ? true
            : options.redrawOnEmpty;
    return ListMultiItemEditor.create(
        textEditorEx(options, inputComponent),
        () => ""
    );
};
