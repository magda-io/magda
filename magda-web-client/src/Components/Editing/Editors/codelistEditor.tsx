import React from "react";
import Editor from "./Editor";
import { ListMultiItemEditor } from "./multiItem";

export function codelistEditor(options: any, reorder = false): Editor {
    return {
        edit: (value: any, onChange: Function, valuesToAvoid?: any) => {
            const callback = event => {
                onChange(event.target.value);
            };
            value = value || "";
            valuesToAvoid = valuesToAvoid || [];
            let keys = Object.keys(options);
            if (reorder) {
                keys = keys.sort(alphaLabelSort(options));
            }
            return (
                <select
                    className="au-select"
                    defaultValue={value}
                    onChange={callback}
                    key={valuesToAvoid.join("-")}
                >
                    <option value="" disabled>
                        Please select one
                    </option>
                    {keys
                        .filter(item => valuesToAvoid.indexOf(item) === -1)
                        .map(val => {
                            return <option value={val}>{options[val]}</option>;
                        })}
                </select>
            );
        },
        view: (value: any) => {
            return (
                <React.Fragment>
                    {(options[value] && `${options[value]}`) ||
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
