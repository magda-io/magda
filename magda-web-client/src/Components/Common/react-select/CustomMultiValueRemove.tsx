import React from "react";
import { MultiValueProps } from "react-select/src/components/MultiValue";
import dismissIcon from "../../../assets/dismiss-white.svg";

type OptionType = {
    label: string;
    value: any;
};

const CustomMultiValueRemove = (props: MultiValueProps<OptionType>) => {
    const { data, innerProps } = props;
    debugger;
    return (
        <button {...innerProps} aria-label={`Remove option ${data.label}`}>
            <img src={dismissIcon} />
        </button>
    );
};

export default CustomMultiValueRemove;
