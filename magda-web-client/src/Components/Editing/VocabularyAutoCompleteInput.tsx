import React from "react";
import Autosuggest from "react-autosuggest";
import { query } from "../../helpers/VocabularyApis";
import throttle from "lodash/throttle";
import debounce from "lodash/debounce";
import "./VocabularyAutoCompleteInput.scss";

type StateData = {
    value: string;
    suggestions: string[];
};

type Prop = {
    suggestionSize: number;
    [key: string]: any;
};

const throttledQuery = throttle(query, 500);
const debouncedQuery = debounce(query, 500);

class VocabularyAutoCompleteInput extends React.Component<Prop, StateData> {
    private currentQuery: string;
    private inputRef: HTMLInputElement | null = null;
    private key: string = `VocabularyAutoCompleteInput_${Math.random()}`.replace(
        ".",
        ""
    );

    static defaultProps = {
        suggestionSize: 10
    };

    constructor(props) {
        super(props);
        this.state = {
            value: this.props.defaultValue ? this.props.defaultValue : "",
            suggestions: []
        };
        this.currentQuery = "";
        this.onSuggestionsFetchRequested = this.onSuggestionsFetchRequested.bind(
            this
        );
        this.onSuggestionsClearRequested = this.onSuggestionsClearRequested.bind(
            this
        );
        this.onSuggestionSelected = this.onSuggestionSelected.bind(this);
        this.onChange = this.onChange.bind(this);
    }

    async onSuggestionsFetchRequested({ value }) {
        let inputValue = typeof value === "string" && value ? value : "";
        inputValue = inputValue.trim().toLowerCase();
        if (!inputValue.length) {
            this.setState(state => ({ ...state, suggestions: [] }));
            return;
        }
        this.currentQuery = inputValue;

        let keywords: string[] = [];
        try {
            // --- we repsonse quicker in the begining as people need more hints
            // --- and slow down when input content is longer than 5
            if (inputValue.length < 5 || inputValue.endsWith(" ")) {
                keywords = await throttledQuery(inputValue);
            } else {
                keywords = await debouncedQuery(inputValue);
            }
            if (this.currentQuery !== inputValue) {
                return;
            }
            keywords = Array.isArray(keywords) ? keywords : [];
            if (keywords.length > this.props.suggestionSize) {
                keywords = keywords.slice(0, this.props.suggestionSize);
            }
            this.setState(state => ({
                ...state,
                suggestions: keywords ? keywords : []
            }));
        } catch (e) {
            console.error(e);
            this.setState(state => ({ ...state, suggestions: [] }));
        }
    }

    onSuggestionsClearRequested() {
        this.setState(state => ({ ...state, suggestions: [] }));
    }

    onChange(event, { newValue }) {
        this.setState(state => ({
            ...state,
            value: newValue
        }));

        const { onChange: incomingOnChange } = this.props;
        if (incomingOnChange) {
            incomingOnChange(event);
        }
    }

    onSuggestionSelected(event, { suggestionValue, method }) {
        if (this.inputRef) {
            this.inputRef.value = suggestionValue;
        }
        // --- manually trigger event to trigger action of wrapper components
        // --- we probably should define a proper interface rather than rely on event
        if (typeof this.props.onChange === "function") {
            this.props.onChange({
                preventDefault: () => {},
                target: this.inputRef,
                current: this.inputRef,
                value: suggestionValue
            });
        }
        setTimeout(() => {
            if (typeof this.props.onKeyUp === "function") {
                this.props.onKeyUp({
                    preventDefault: () => {},
                    target: this.inputRef,
                    current: this.inputRef,
                    keyCode: 13,
                    which: 13
                });
                this.setState(state => ({
                    ...state,
                    value: ""
                }));
                this.props.onChange({
                    preventDefault: () => {},
                    target: this.inputRef,
                    current: this.inputRef,
                    value: ""
                });
            }
        }, 1);
    }

    render() {
        const {
            className: incomingClassName,
            defaultValue,
            ...restProps
        } = this.props;

        const inputProps = {
            ...restProps,
            onChange: this.onChange,
            value: this.state.value
        };

        const renderInputComponent = inputProps => {
            const { ref: propsRef } = inputProps;
            // -- we need ref of input as well
            // -- we will retrieve the ref and share with other components
            return (
                <input
                    {...inputProps}
                    ref={ref => {
                        this.inputRef = ref;
                        if (typeof propsRef === "function") {
                            propsRef(ref);
                        }
                    }}
                />
            );
        };

        return (
            <Autosuggest
                id={this.key}
                inputProps={inputProps}
                suggestions={this.state.suggestions}
                onSuggestionsFetchRequested={this.onSuggestionsFetchRequested}
                onSuggestionsClearRequested={this.onSuggestionsClearRequested}
                getSuggestionValue={getSuggestionValue}
                renderSuggestion={renderSuggestion}
                onSuggestionSelected={this.onSuggestionSelected}
                renderInputComponent={renderInputComponent}
                theme={{
                    input: incomingClassName
                        ? `react-autosuggest__input ${incomingClassName}`
                        : "react-autosuggest__input",
                    container: "vocabulary-auto-complete-input",
                    suggestion: "suggestion-item",
                    suggestionsList: "suggestions-list",
                    suggestionsContainer: "suggestions-container"
                }}
            />
        );
    }
}

const getSuggestionValue = suggestion => suggestion;

const renderSuggestion = suggestion => <div>{suggestion}</div>;

export default VocabularyAutoCompleteInput;
