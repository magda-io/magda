import React, { useState, ReactNode, useEffect } from "react";

type Props<T> = {
    name: string;
    children: ReactNode;
    value: T | undefined;
    onChange: (value: T | undefined) => void;
};

/**
 * Wraps around children, adding "Yes" and "No" radio buttons that will
 * show/hide them.
 *
 * @param value The value that will be set if "Yes" is selected (controls
 *      whether "Yes" or "No" is initially selected.
 * @param onChange Callback that will be invoked in two cases:
 *      - When "No" is pressed (to set the value to undefined)
 *      - When "Yes" is pressed after "no" is pressed (to automatically
 *          set the value back to what it was before "No" was pressed.
 * @param name A name to set on the input elements
 */
export default function YesNoReveal<T>({
    value,
    onChange,
    name,
    children
}: Props<T>) {
    const [show, setShow] = useState<boolean>(!!value);
    const [hasUserClick, setHasUserClick] = useState<boolean>(false);
    useEffect(() => {
        const shouldShow = !!value;
        if (shouldShow !== show && !hasUserClick) {
            setShow(shouldShow);
        }
    }, [value]);

    const onChangeHandler = (event: React.ChangeEvent<HTMLInputElement>) => {
        setHasUserClick(true);
        if (event.target.value === "yes") {
            onChange(value);
            setShow(true);
        } else {
            onChange(undefined);
            setShow(false);
        }
    };

    return (
        <div>
            <div>
                <div className="au-control-input">
                    <input
                        className="au-control-input__input"
                        type="radio"
                        id={name + "-no"}
                        checked={!show}
                        name={name}
                        value="no"
                        onChange={onChangeHandler}
                    />
                    <label
                        htmlFor={name + "-no"}
                        className="au-control-input__text"
                    >
                        No
                    </label>
                </div>
            </div>
            <div>
                <div className="au-control-input">
                    <input
                        className="au-control-input__input"
                        type="radio"
                        id={name + "-yes"}
                        checked={show}
                        name={name}
                        value="yes"
                        onChange={onChangeHandler}
                    />
                    <label
                        className="au-control-input__text"
                        htmlFor={name + "-yes"}
                    >
                        Yes
                    </label>
                </div>
            </div>
            {show && children}
        </div>
    );
}
