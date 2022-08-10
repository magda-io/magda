import React from "react";
import Editor from "./Editor";

import "./booleanEditor.scss";

export const booleanEditor: Editor<boolean> = {
    edit: (value: any, onChange: Function) => {
        const change = (event) => {
            value = !value;
            onChange(value);
        };
        return (
            <div
                onClick={change}
                className={
                    value
                        ? "boolean-editor boolean-editor-yes"
                        : "boolean-editor boolean-editor-no"
                }
            >
                <div className="boolean-editor-slider" />
            </div>
        );
    },
    view: (value: any) => {
        return <React.Fragment>{value ? "YES" : "NO"}</React.Fragment>;
    }
};
