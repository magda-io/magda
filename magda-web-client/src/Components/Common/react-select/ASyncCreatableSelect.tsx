import React, { useRef } from "react";
import uuidv4 from "uuid/v4";
import AsyncCreatable, {
    default as ASyncCreatableSelectOriginal
} from "react-select/async-creatable";
import { AsyncProps } from "react-select/async";
import { Props as SelectProps } from "react-select/src/Select";
import { CreatableProps } from "react-select/Creatable";
import CustomInputWithValidation from "Components/Common/react-select/CustomInputWithValidation";
import ReactSelectStyles from "Components/Common/react-select/ReactSelectStyles";
import * as ValidationManager from "../../Dataset/Add/ValidationManager";
const useValidation = ValidationManager.useValidation;

interface ASyncCreatableSelectExtraPropsType {
    validationFieldPath?: string;
    validationFieldLabel?: string;
}

type ASyncCreatableSelectPropsType<
    OptionType
> = ASyncCreatableSelectExtraPropsType &
    AsyncProps<OptionType> &
    CreatableProps<OptionType> &
    SelectProps<OptionType>;

function ASyncCreatableSelect<OptionType>(
    props: ASyncCreatableSelectPropsType<OptionType>
) {
    const {
        validationFieldPath,
        validationFieldLabel,
        onBlur,
        ...restProps
    } = props;
    const [isValidationError, validationErrorMessage, elRef] = useValidation(
        validationFieldPath,
        validationFieldLabel
    );
    const onBlurHanlder = (event: any) => {
        if (validationFieldPath) {
            ValidationManager.onInputFocusOut(validationFieldPath);
        }
        if (onBlur && typeof onBlur === "function") {
            onBlur(event);
        }
    };
    const errorMessageId = `input-error-text-${uuidv4()}`;

    const selectRef = useRef<AsyncCreatable<OptionType>>(null);
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

    return (
        <div
            ref={containerDivRef}
            className={`select-box select-box-async ${
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
            <ASyncCreatableSelectOriginal
                ref={selectRef}
                errorMessageId={errorMessageId}
                aria-label={validationErrorMessage}
                styles={ReactSelectStyles}
                onBlur={onBlurHanlder}
                isValidationError={isValidationError}
                validationErrorMessage={validationErrorMessage}
                validationElRef={elRef}
                {...restProps}
                components={{
                    Input: CustomInputWithValidation
                }}
            />
        </div>
    );
}

export default ASyncCreatableSelect;
