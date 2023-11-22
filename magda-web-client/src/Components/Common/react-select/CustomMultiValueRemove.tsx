import React from "react";
import { MultiValueProps } from "react-select/src/components/MultiValue";
import dismissIcon from "../../../assets/dismiss-white.svg";
import { OptionTypeBase } from "react-select";

function CustomMultiValueRemove<T extends OptionTypeBase>(
    props: MultiValueProps<T>
) {
    const { data, innerProps } = props;
    return (
        <button
            {...innerProps}
            aria-label={`Remove option ${props.selectProps.getOptionLabel!(
                data
            )}`}
        >
            <img src={dismissIcon} />
        </button>
    );
}

export default CustomMultiValueRemove;
