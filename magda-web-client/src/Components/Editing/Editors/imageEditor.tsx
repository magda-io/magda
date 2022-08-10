import React from "react";
import Editor from "./Editor";
import readFile from "helpers/readFile";

export const base64ImageEditor: Editor<string> = {
    edit: (value: any, onChange: Function) => {
        const change = async (event) => {
            value = await readFile("image/*", "DataURL");
            value = value.data;
            onChange(value);
        };
        return (
            <React.Fragment>
                <img src={value} onClick={change} />
                <button onClick={change}>Change</button>
            </React.Fragment>
        );
    },
    view: (value: any) => {
        return <img src={value} />;
    }
};
