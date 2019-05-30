import React, { ReactEventHandler } from "react";
import Editor from "./Editor";

import { ListMultiItemEditor } from "./multiItem";

export type InputComponentParmeter = React.ComponentType<{
    className?: string;
    defaultValue?: string;
    onChange?: ReactEventHandler;
    [k: string]: any;
}> | null;

export function textEditorEx(
    options: any = {},
    InputComponent: InputComponentParmeter = null
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
            <textarea
                className="au-text-input full-width-ctrl au-text-input--block"
                style={{ width: "100%" }}
                onChange={callback}
                defaultValue={value as string}
            />
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
    inputComponent: InputComponentParmeter = null
) => {
    options.redrawOnEmpty = true;
    return ListMultiItemEditor.create(
        textEditorEx(options, inputComponent),
        () => ""
    );
};
