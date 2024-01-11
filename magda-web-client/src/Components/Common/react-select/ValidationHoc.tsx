import React, { useRef, useMemo, RefAttributes } from "react";
import { v4 as uuidv4 } from "uuid";
import { Props as SelectProps, GroupBase, SelectInstance } from "react-select";
import CustomInputWithValidation from "Components/Common/react-select/CustomInputWithValidation";
import ReactSelectStyles from "Components/Common/react-select/ReactSelectStyles";
import * as ValidationManager from "../../Dataset/Add/ValidationManager";
import { CustomValidatorType } from "../../Dataset/Add/ValidationManager";

import Select from "react-select/dist/declarations/src/Select";
import type StateManagedSelect from "react-select/dist/declarations/src/stateManager";
import type { StateManagerProps } from "react-select/dist/declarations/src/stateManager";
import type CreatableSelect from "react-select/dist/declarations/src/Creatable";
import type { CreatableProps } from "react-select/dist/declarations/src/Creatable";
import type AsyncCreatableSelect from "react-select/dist/declarations/src/async-creatable";
import type { AsyncCreatableProps } from "react-select/dist/declarations/src/async-creatable";
import type AsyncSelect from "react-select/dist/declarations/src/Async";
import type { AsyncProps } from "react-select/dist/declarations/src/Async";

const useValidation = ValidationManager.useValidation;

/* eslint-disable react-hooks/rules-of-hooks */

interface SelectExtraPropsType {
    validationFieldPath?: string;
    validationFieldLabel?: string;
    customValidator?: CustomValidatorType;
}

type PropsType<
    Option = Record<string, any>,
    IsMulti extends boolean = false,
    Group extends GroupBase<Option> = GroupBase<Option>
> = (
    | (StateManagerProps<Option, IsMulti, Group> &
          RefAttributes<Select<Option, IsMulti, Group>>)
    | (AsyncCreatableProps<Option, IsMulti, Group> &
          RefAttributes<Select<Option, IsMulti, Group>>)
    | (CreatableProps<Option, IsMulti, Group> &
          RefAttributes<Select<Option, IsMulti, Group>>)
    | (AsyncProps<Option, IsMulti, Group> &
          RefAttributes<Select<Option, IsMulti, Group>>)
) &
    SelectExtraPropsType;

type ReactSelectComponentType =
    | StateManagedSelect
    | AsyncCreatableSelect
    | CreatableSelect
    | AsyncSelect;

function ValidationHoc<
    OptionType extends Record<string, any>,
    IsMulti extends boolean = false,
    Group extends GroupBase<OptionType> = GroupBase<OptionType>
>(ReactSelectKindComponent: ReactSelectComponentType) {
    return (props: PropsType<OptionType, IsMulti, Group>) => {
        const {
            validationFieldPath,
            validationFieldLabel,
            customValidator,
            onChange,
            ...restProps
        } = props;

        const [
            isValidationError,
            validationErrorMessage,
            elRef
        ] = useValidation(
            validationFieldPath,
            validationFieldLabel,
            customValidator
        );

        const onChangeHandler = (event, action) => {
            if (onChange && typeof onChange === "function") {
                onChange(event, action);
            }
            if (validationFieldPath) {
                ValidationManager.onInputFocusOut(validationFieldPath);
            }
        };

        // --- only generate once
        const errorMessageId = useMemo(
            () => `input-error-text-${uuidv4()}`,
            // eslint-disable-next-line react-hooks/exhaustive-deps
            undefined
        );

        const selectRef = useRef<SelectInstance<OptionType, IsMulti, Group>>(
            null
        );
        const containerDivRef = useRef<HTMLDivElement>(null);

        elRef.current = {
            getBoundingClientRect: () => {
                if (containerDivRef && containerDivRef.current) {
                    return containerDivRef.current.getBoundingClientRect();
                } else {
                    return null;
                }
            },
            scrollIntoView: (arg?: any) => {
                if (containerDivRef && containerDivRef.current) {
                    containerDivRef.current.scrollIntoView(arg);
                }
            },
            blur: () => {
                if (selectRef && selectRef.current) {
                    selectRef.current.blur();
                }
            },
            focus: (options?: FocusOptions) => {
                if (selectRef && selectRef.current) {
                    selectRef.current.focus();
                }
            }
        };

        const Component = ReactSelectKindComponent;

        return (
            <div
                ref={containerDivRef}
                className={`react-select-with-validation-container ${
                    isValidationError ? "invalid" : ""
                }`}
            >
                {isValidationError ? (
                    <div>
                        <span className="au-error-text" id={errorMessageId}>
                            {validationErrorMessage}
                        </span>
                    </div>
                ) : null}
                <Component
                    ref={selectRef}
                    aria-label={validationErrorMessage}
                    styles={ReactSelectStyles}
                    onChange={onChangeHandler}
                    isValidationError={isValidationError}
                    validationErrorMessage={validationErrorMessage}
                    validationElRef={elRef}
                    {...restProps}
                    components={{
                        ...(restProps.components ? restProps.components : {}),
                        Input: CustomInputWithValidation
                    }}
                />
            </div>
        );
    };
}

export default ValidationHoc;

/* eslint-enable react-hooks/rules-of-hooks */
