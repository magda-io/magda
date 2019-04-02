import React from "react";
import Editor from "./Editor";
import { ListMultiItemEditor } from "./multiItem";

export function codelistEditor(options: any, reorder = false): Editor {
    return {
        edit: (value: any, onChange: Function) => {
            const callback = event => {
                onChange(event.target.value);
            };
            value = value || "";
            let keys = Object.keys(options);
            if (reorder) {
                keys = keys.sort(alphaLabelSort(options));
            }
            return (
                <select
                    className="au-select"
                    defaultValue={value}
                    onChange={callback}
                >
                    <option value="" disabled>
                        Please select one
                    </option>
                    {keys.map(val => {
                        return <option value={val}>{options[val]}</option>;
                    })}
                </select>
            );
        },
        view: (value: any) => {
            return (
                <React.Fragment>
                    {(options[value] &&
                        `${options[value]}${
                            value.toLowerCase() === options[value].toLowerCase()
                                ? ""
                                : " [" + value + "]"
                        }`) ||
                        value ||
                        "NOT SET"}
                </React.Fragment>
            );
        }
    };
}

function alphaLabelSort(labels, order = 1) {
    return (a, b) => {
        a = labels[a].toLowerCase();
        b = labels[b].toLowerCase();
        if (a > b) {
            return order;
        } else if (a < b) {
            return -order;
        } else {
            return 0;
        }
    };
}

export function multiCodelistEditor(options: any, reorder = false): Editor {
    const single = codelistEditor(options, reorder);
    return ListMultiItemEditor.create(single, () => "");
}
