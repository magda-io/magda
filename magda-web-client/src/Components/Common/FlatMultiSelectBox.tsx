import React, {
    forwardRef,
    useRef,
    useEffect,
    useImperativeHandle,
    RefForwardingComponent,
    RefObject
} from "react";
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

export interface OptionHandles {
    scrollIntoView(parentRef: RefObject<HTMLDivElement>): void;
}

const FlatMultiSelectBoxOptionForwarding: RefForwardingComponent<
    OptionHandles,
    SelectOptionProps
> = (props, ref) => {
    const itemRef: RefObject<HTMLButtonElement> = useRef(null);
    useImperativeHandle(ref, () => ({
        scrollIntoView: (parentRef) => {
            if (
                !itemRef ||
                !itemRef.current ||
                !parentRef ||
                !parentRef.current
            )
                return;
            parentRef.current.scrollBy({
                top:
                    itemRef.current.offsetTop -
                    parentRef.current.offsetTop +
                    parentRef.current.scrollTop,
                behavior: "smooth"
            });
        }
    }));
    return (
        <button
            ref={itemRef}
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

const FlatMultiSelectBoxOption = forwardRef(FlatMultiSelectBoxOptionForwarding);

const FlatMultiSelectBox = (props: SelectProps) => {
    const value = props.value;
    let options: ArrayOptionItem[] = Array.isArray(props.options)
        ? props.options
        : Object.keys(props.options).map((key) => ({
              label: props.options[key],
              value: key
          }));

    let firstSelectedIdx = -1;

    options = options.map((opt, idx) => {
        if (value && Array.isArray(value) && value.length) {
            opt.isSelected = value.indexOf(opt.value) !== -1;
        } else {
            opt.isSelected = false;
        }
        if (firstSelectedIdx === -1 && opt.isSelected) {
            firstSelectedIdx = idx;
        }
        return opt;
    });

    const optionRefs: RefObject<OptionHandles>[] = options.map((opt) =>
        // eslint-disable-next-line react-hooks/rules-of-hooks
        useRef(null)
    );
    const scrollContainerRef: RefObject<HTMLDivElement> = useRef(null);

    const renderResult = (
        <div className={"flat-multi-select-box"}>
            <div className="inner-container" ref={scrollContainerRef}>
                {options.map((item, idx) => (
                    <FlatMultiSelectBoxOption
                        key={idx}
                        idx={idx}
                        ref={optionRefs[idx]}
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
                                            (v) => v !== value
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

    useEffect(() => {
        if (firstSelectedIdx === -1) return;
        if (
            !optionRefs[firstSelectedIdx] ||
            !optionRefs[firstSelectedIdx].current
        )
            return;
        const optionHandles = optionRefs[firstSelectedIdx]
            .current as OptionHandles;
        optionHandles.scrollIntoView(scrollContainerRef);
    }, []);

    return renderResult;
};

export default FlatMultiSelectBox;
