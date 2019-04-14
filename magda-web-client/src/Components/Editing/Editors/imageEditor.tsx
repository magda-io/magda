import React from "react";
import Editor from "./Editor";
import readFile from "helpers/readFile";

export const base64ImageEditor: Editor = {
    edit: (value: any, onChange: Function) => {
        const change = async event => {
            value = await readFile("image/*", "DataURL");
            value = value.data;
            onChange(value);
        };
        return <img src={value} onClick={change} />;
    },
    view: (value: any) => {
        return <img src={value} />;
    }
};
