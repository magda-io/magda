import React, { ReactEventHandler } from "react";
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
