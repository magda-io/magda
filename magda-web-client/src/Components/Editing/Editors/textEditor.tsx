import React, {
    ReactEventHandler,
    FunctionComponent,
    createRef,
    useEffect,
    useState,
    RefObject
} from "react";
import Editor from "./Editor";
import editIcon from "assets/edit.svg";
import uuidv4 from "uuid/v4";
import { ListMultiItemEditor } from "./multiItem";
import * as ValidationManager from "../../Dataset/Add/ValidationManager";

export type InputComponentParameter = React.ComponentType<{
    className?: string;
    defaultValue?: string;
    onChange?: ReactEventHandler;
    [k: string]: any;
}> | null;

export function textEditorEx(
    options: any = {},
    InputComponent: InputComponentParameter = null
) {
    return {
        edit: (
            value: any,
            onChange: Function,
            multiValues: any = null,
            extraProps: any = {}
        ) => {
            const callback = event => {
                onChange(event.target.value);
            };
            if (options.redrawOnEmpty && !value) {
                options.key = Math.random();
            }
            if (InputComponent) {
                return (
                    <InputComponent
                        className={
                            options.fullWidth
                                ? "au-text-input full-width-ctrl textEditorEx"
                                : "au-text-input non-full-width-ctrl textEditorEx"
                        }
                        defaultValue={value as string}
                        onChange={callback}
                        {...options}
                        {...extraProps}
                    />
                );
            } else {
                const {
                    isValidationError,
                    validationErrorMessage
                } = extraProps;

                delete extraProps.isValidationError;
                delete extraProps.validationErrorMessage;

                if (isValidationError === true) {
                    const errorMessageId = `input-error-text-${uuidv4()}`;
                    return (
                        <div className="textEditorEx-outter-container">
                            <div>
                                <span
                                    className="au-error-text"
                                    id={errorMessageId}
                                >
                                    {validationErrorMessage}
                                </span>
                            </div>
                            <input
                                className={
                                    options.fullWidth
                                        ? "au-text-input au-text-input--invalid full-width-ctrl textEditorEx"
                                        : "au-text-input au-text-input--invalid non-full-width-ctrl textEditorEx"
                                }
                                aria-invalid="true"
                                aria-describedby={errorMessageId}
                                defaultValue={value as string}
                                onChange={callback}
                                {...options}
                                {...extraProps}
                            />
                            <div className="edit-icon-container">
                                <img className="edit-icon" src={editIcon} />
                            </div>
                        </div>
                    );
                } else {
                    return (
                        <div className="textEditorEx-outter-container">
                            <input
                                className={
                                    options.fullWidth
                                        ? "au-text-input full-width-ctrl textEditorEx"
                                        : "au-text-input non-full-width-ctrl textEditorEx"
                                }
                                defaultValue={value as string}
                                onChange={callback}
                                {...options}
                                {...extraProps}
                            />
                            <div className="edit-icon-container">
                                <img className="edit-icon" src={editIcon} />
                            </div>
                        </div>
                    );
                }
            }
        },
        view: (value: any) => {
            return <React.Fragment>{value ? value : "NOT SET"}</React.Fragment>;
        }
    };
}

export const textEditor = textEditorEx({});
export const textEditorFullWidth = textEditorEx({ fullWidth: true });

interface MultilineTextEditorPropType {
    isEditorMode?: boolean;
    limit?: number;
    value?: string;
    placerHolder?: string;
    validationFieldPath?: string;
    validationFieldLabel?: string;
    onChange?: (value: string) => void;
}

const wordsCount = (str: string): number => {
    if (typeof str !== "string" || !str) return 0;
    return str.trim().split(/\W+/).length;
};

// --- truncate by words count & preserve non-words chars parttern
// --- this is required by line breaks
const truncateByWordsCount = (str: string, limit: number): string => {
    const count = wordsCount(str);
    if (count <= limit) return str;

    const nonWords = str.trim().match(/\W+/g);
    const words = str.trim().split(/\W+/);
    if (!nonWords || !words.length) return str;

    const newStrItems: string[] = [];
    for (let i = 0; i < limit; i++) {
        if (i !== 0) newStrItems.push(nonWords[i - 1]);
        newStrItems.push(words[i]);
    }
    return newStrItems.join("");
};

interface MultilineTextEditorStateType {
    ref: RefObject<HTMLTextAreaElement>;
    isValidationError: boolean;
    validationErrorMessage: string;
}

export const MultilineTextEditor: FunctionComponent<
    MultilineTextEditorPropType
> = props => {
    const [state, setState] = useState<MultilineTextEditorStateType>({
        ref: createRef(),
        isValidationError: false,
        validationErrorMessage: ""
    });

    useEffect(() => {
        if (props.validationFieldPath) {
            ValidationManager.registerValidationItem({
                jsonPath: props.validationFieldPath,
                label: props.validationFieldLabel
                    ? props.validationFieldLabel
                    : "",
                elRef: state.ref,
                setError: errorMessage => {
                    setState({
                        ref: state.ref,
                        isValidationError: true,
                        validationErrorMessage: errorMessage
                    });
                },
                clearError: () => {
                    setState({
                        ref: state.ref,
                        isValidationError: false,
                        validationErrorMessage: ""
                    });
                }
            });
        }
        return () => {
            if (props.validationFieldPath) {
                ValidationManager.deregisterValidationItem(
                    props.validationFieldPath
                );
            }
        };
    }, [props.validationFieldPath, props.validationFieldLabel]);

    const isEditorMode = props.isEditorMode === false ? false : true;
    const placerHolder = props.placerHolder ? props.placerHolder : "";
    const value = props.value ? props.value : "";
    const limit = props.limit ? props.limit : 0;

    if (isEditorMode) {
        const errorMessageId = `input-error-text-${uuidv4()}`;
        const extraProps: any = {
            ref: state.ref
        };
        if (props.validationFieldPath) {
            extraProps.onBlur = () => {
                ValidationManager.onInputFocusOut(
                    props.validationFieldPath as string
                );
            };
        }
        let inValidClass = "";
        if (state.isValidationError) {
            extraProps["aria-invalid"] = true;
            extraProps["aria-describedby"] = errorMessageId;
            inValidClass = "au-text-input--invalid";
        }
        return (
            <div className="multilineTextEditor-outter-container">
                {state.isValidationError ? (
                    <div>
                        <span className="au-error-text" id={errorMessageId}>
                            {state.validationErrorMessage}
                        </span>
                    </div>
                ) : null}
                <textarea
                    className={`au-text-input ${inValidClass} full-width-ctrl au-text-input--block`}
                    onChange={event => {
                        if (typeof props.onChange === "function") {
                            let inputValue = event.target.value
                                ? event.target.value
                                : "";
                            if (limit && wordsCount(inputValue) > limit) {
                                inputValue = truncateByWordsCount(
                                    inputValue,
                                    limit
                                );
                            }
                            props.onChange(inputValue);
                        }
                    }}
                    placeholder={placerHolder}
                    value={props.value as string}
                    {...extraProps}
                />
                <div className="edit-icon-container">
                    <img className="edit-icon" src={editIcon} />
                </div>
                {limit ? (
                    <div className="word-count-row">
                        {(() => {
                            let count = limit - wordsCount(value);
                            return count < 0 ? 0 : count;
                        })()}{" "}
                        words remaining
                    </div>
                ) : null}
            </div>
        );
    } else {
        return <React.Fragment>{value ? value : "NOT SET"}</React.Fragment>;
    }
};

export const multilineTextEditor: Editor<string> = {
    edit: (value: any, onChange: Function) => {
        const callback = event => {
            onChange(event.target.value);
        };
        return (
            <div className="multilineTextEditor-outter-container">
                <textarea
                    className="au-text-input full-width-ctrl au-text-input--block"
                    style={{ width: "100%" }}
                    onChange={callback}
                    defaultValue={value as string}
                />
                <div className="edit-icon-container">
                    <img className="edit-icon" src={editIcon} />
                </div>
            </div>
        ); //<input defaultValue={value as string} onChange={callback} />;
    },
    view: (value: any) => {
        return <React.Fragment>{value ? value : "NOT SET"}</React.Fragment>;
    }
};

export const multiTextEditor: Editor<string[]> = ListMultiItemEditor.create(
    textEditor,
    () => ""
);

export const multiTextEditorEx = (
    options,
    inputComponent: InputComponentParameter = null
) => {
    options.redrawOnEmpty =
        typeof options.redrawOnEmpty !== "boolean"
            ? true
            : options.redrawOnEmpty;
    return ListMultiItemEditor.create(
        textEditorEx(options, inputComponent),
        () => ""
    );
};
