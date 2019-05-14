import React from "react";
import Editor from "./Editor";
import { ListMultiItemEditor } from "./multiItem";

export function codelistEditor(
    options: any,
    reorder = false,
    defaultOptionText: string = ""
): Editor {
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
                        {defaultOptionText
                            ? defaultOptionText
                            : "Please select one"}
                    </option>
                    {keys
                        .filter(item => valuesToAvoid.indexOf(item) === -1)
                        .map((val, i) => {
                            return (
                                <option key={i} value={val}>
                                    {options[val]}
                                </option>
                            );
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

export function codelistRatioEditor(options: any, reorder = false): Editor {
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
            const name = Math.random() + ".";
            return (
                <div>
                    {keys.map(val => {
                        return (
                            <div>
                                <div className="au-control-input">
                                    <input
                                        className="au-control-input__input"
                                        type="radio"
                                        value={val}
                                        name={name}
                                        id={name + val}
                                        onChange={callback}
                                        checked={value === val}
                                    />{" "}
                                    <label
                                        className="au-control-input__text"
                                        htmlFor={name + val}
                                    >
                                        {options[val]}
                                    </label>
                                </div>
                            </div>
                        );
                    })}
                </div>
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

export function multiCodelistEditor(
    options: any,
    reorder = false,
    defaultOptionText: string = ""
): Editor {
    const single = codelistEditor(options, reorder, defaultOptionText);
    return ListMultiItemEditor.create(single, () => "");
}
