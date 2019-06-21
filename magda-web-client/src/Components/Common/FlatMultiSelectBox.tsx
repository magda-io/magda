import React from "react";
import "./flat-multi-select-box.scss";

type ArrayOptionItem = {
    label: string;
    value: any;
};

type SelectOptions =
    | {
          [k: string]: string;
      }
    | ArrayOptionItem[];

type SelectProps = {
    options: SelectOptions;
    value: any[];
    defaultValue?: any[];
};

type SelectOptionProps = {
    label: string;
    value: any;
    isSelected?: boolean;
};

const FlatMultiSelectBoxOption = (props: SelectOptionProps) => {
    return <div>{props.label}</div>;
};

const FlatMultiSelectBox = (props: SelectProps) => {
    const options: ArrayOptionItem[] = Array.isArray(props.options)
        ? props.options
        : Object.keys(props.options).map(key => ({
              label: props.options[key],
              value: key
          }));
    return (
        <div className={"flat-multi-select-box"}>
            {options.map(item => (
                <FlatMultiSelectBoxOption
                    label={item.label}
                    value={item.value}
                    isSelected={false}
                />
            ))}
        </div>
    );
};

export default FlatMultiSelectBox;
