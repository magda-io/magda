import React, {useRef} from "react";
import "./FlatMultiSelectBox.scss";
import dismissIcon from "../../assets/dismiss-white.svg";

type ArrayOptionItem = {
    label: string;
    value: any;
    isSelected?: boolean;
};

type SelectOptions =
    | {
          [k: string]: string;
      }
    | ArrayOptionItem[];

type SelectProps = {
    options: SelectOptions;
    value?: any[] | undefined;
    onChange?: (value: any) => void;
};

type SelectOptionProps = {
    idx: number;
    label: string;
    value: any;
    isSelected?: boolean;
    onClick?: (value: any, idx: number) => void;
};

const scrollToRef = (ref) => window.scrollTo(0, ref.current.offsetTop);

const ReadyToScroll = () => {

   const myRef = useRef(null) // Hook to ref object
   const executeScroll = () => scrollToRef(myRef)

   return (<div className="label" ref={myRef}>I wanna be seen</div>);
}

const FlatMultiSelectBoxOption = (props: SelectOptionProps) => {
    return (
        <button
            className={`au-btn flat-multi-select-option ${
                props.isSelected ? "selected" : ""
            }`}
            arial-label={
                props.isSelected ? "De-select option" : "Select option"
            }
            onClick={() =>
                props.onClick && props.onClick(props.value, props.idx)
            }
        >
            <div className="label">{props.label}</div>
            {props.isSelected ? <img src={dismissIcon} /> : null}
        </button>
    );
};

const FlatMultiSelectBox = (props: SelectProps) => {
    const value = props.value;
    let options: ArrayOptionItem[] = Array.isArray(props.options)
        ? props.options
        : Object.keys(props.options).map(key => ({
              label: props.options[key],
              value: key
          }));

    options = options.map(opt => {
        if (value && Array.isArray(value) && value.length) {
            opt.isSelected = value.indexOf(opt.value) !== -1;
        } else {
            opt.isSelected = false;
        }
        return opt;
    });

    return (
        <div className={"flat-multi-select-box"}>
            <div className="inner-container">
                {options.map((item, idx) => (
                    <FlatMultiSelectBoxOption
                        key={idx}
                        idx={idx}
                        label={item.label}
                        value={item.value}
                        isSelected={item.isSelected}
                        onClick={(value: any) => {
                            if (!props.onChange) return;
                            const originalValue = props.value;
                            let newValue;
                            if (
                                !originalValue ||
                                !Array.isArray(originalValue)
                            ) {
                                newValue = [];
                            } else {
                                if (originalValue.indexOf(value) === -1) {
                                    newValue = [...originalValue];
                                    newValue.push(value);
                                } else {
                                    newValue = [
                                        ...originalValue.filter(
                                            v => v !== value
                                        )
                                    ];
                                }
                            }
                            props.onChange(newValue);
                        }}
                    />
                ))}
            </div>
        </div>
    );
};

export default FlatMultiSelectBox;
