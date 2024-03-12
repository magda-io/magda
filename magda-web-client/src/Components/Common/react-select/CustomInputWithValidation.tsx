import React, { MutableRefObject } from "react";
import { components } from "react-select";
import { InputProps, GroupBase } from "react-select";
import { ElementType } from "Components/Dataset/Add/ValidationManager";

type ValidationProps = {
    isValidationError?: boolean;
    validationErrorMessage?: string;
    validationElRef?: MutableRefObject<ElementType>;
    errorMessageId?: string;
};

const CustomInputWithValidation = <
    Option,
    IsMulti extends boolean,
    Group extends GroupBase<Option>
>(
    props: InputProps<Option, IsMulti, Group>
) => {
    const selectProps = (props as any).selectProps as ValidationProps;
    if (selectProps.isValidationError === true) {
        return <components.Input {...props} aria-invalid={true} />;
    } else {
        return <components.Input {...props} />;
    }
};

export default CustomInputWithValidation;
