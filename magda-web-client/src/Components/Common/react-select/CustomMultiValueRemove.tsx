import React from "react";
import { components, MultiValueRemoveProps } from "react-select";
import dismissIcon from "../../../assets/dismiss-white.svg";

function CustomMultiValueRemove<T>(props: MultiValueRemoveProps<T>) {
    const { data, innerProps } = props;
    return (
        <components.MultiValueRemove {...props}>
            <div
                {...innerProps}
                aria-label={`Remove option ${props.selectProps.getOptionLabel!(
                    data
                )}`}
            >
                <img src={dismissIcon} alt="remove button" />
            </div>
        </components.MultiValueRemove>
    );
}

export default CustomMultiValueRemove;
