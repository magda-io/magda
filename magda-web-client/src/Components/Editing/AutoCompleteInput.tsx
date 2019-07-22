import React, { KeyboardEvent } from "react";
import Autosuggest, {
    InputProps as AutosuggestInputProps
} from "react-autosuggest";
import debounce from "lodash/debounce";
import keyBy from "lodash/keyBy";
import memoize from "memoize-one";

import "./AutoCompleteInput.scss";

type StateData<T> = {
    value: string;
    suggestions: T[];
};

interface DefaultProps<T> {
    suggestionSize: number;
    emptyOnSelect: boolean;
    exclude: T[];
}

export type InputProps<T> = Omit<
    AutosuggestInputProps<T>,
    "onChange" | "value"
>;

interface Props<T> {
    onSuggestionSelected: (value: T) => void;
    onTypedValueSelected: (value: string) => void;
    query: (query: string) => Promise<T[]>;
    objectToString: (object: T) => string;
    defaultValue?: T;
    inputProps?: InputProps<T>;
}

type PropsWithDefaults<T> = Props<T> & DefaultProps<T>;

class AutoCompleteInput<T> extends React.Component<
    PropsWithDefaults<T>,
    StateData<T>
> {
    static key = 0;

    static defaultProps = {
        suggestionSize: 10,
        emptyOnSelect: true,
        exclude: []
    };

    readonly state: StateData<T> = {
        suggestions: [],
        value: this.props.defaultValue
            ? this.props.objectToString(this.props.defaultValue)
            : ""
    };

    private currentQuery: string = "";
    private key: string = `AutoCompleteInput_${AutoCompleteInput.key++}`;

    getExcludeLookup: (excludes: T[]) => string[] = memoize((excludes: T[]) =>
        keyBy(excludes, exclude =>
            this.props.objectToString(exclude).toLowerCase()
        )
    );

    onSuggestionsFetchRequested = debounce(async ({ value }) => {
        this.clearSuggestions();

        let inputValue = typeof value === "string" && value ? value : "";
        inputValue = inputValue.trim().toLowerCase();
        if (!inputValue.length) {
            return;
        }
        this.currentQuery = inputValue;

        try {
            const optionsResult = await this.props.query(inputValue);

            if (this.currentQuery !== inputValue) {
                return;
            }

            const options = optionsResult
                .filter(option => {
                    const stringOption = this.props.objectToString(option);

                    return !this.getExcludeLookup(this.props.exclude)[
                        stringOption.toLowerCase()
                    ];
                })
                .slice(0, this.props.suggestionSize);

            this.setState(state => ({
                ...state,
                suggestions: options ? options : []
            }));
        } catch (e) {
            console.error(e);
        }
    }, 200);

    clearSuggestions = () => {
        this.setState({ suggestions: [] });
    };

    onFocus = (event: FocusEvent) => {
        this.onSelect(this.state.value);
    };

    onBlur = () => {
        if (!this.props.emptyOnSelect) {
            this.onSelect(this.state.value);
        }
    };

    onKeyUp = (event: KeyboardEvent) => {
        const selectedString = (event.currentTarget as HTMLInputElement).value.trim();
        if (event.keyCode === 13 && selectedString !== "") {
            this.onSelect(selectedString);
        }
    };

    onSuggestionSelected = (event, { suggestionValue }) => {
        this.onSelect(suggestionValue);
    };

    onSelect = (selectedString: string) => {
        const selectedObj = this.state.suggestions.find(
            suggestion =>
                this.props.objectToString(suggestion) === selectedString
        );

        if (selectedObj) {
            this.props.onSuggestionSelected(selectedObj);
        } else {
            this.props.onTypedValueSelected(selectedString);
        }

        if (this.props.emptyOnSelect) {
            this.setState({
                value: ""
            });
        }
    };

    onChange = (event, { newValue }) => {
        this.setState({
            value: newValue
        });
    };

    renderSuggestion = (suggestion: T) => (
        <div>{this.props.objectToString(suggestion)}</div>
    );

    render() {
        const inputProps: AutosuggestInputProps<T> = {
            ...this.props.inputProps,
            onKeyUp: this.onKeyUp,
            onChange: this.onChange,
            onBlur: this.onBlur,
            value: this.state.value
        };

        return (
            <Autosuggest<T>
                id={this.key}
                inputProps={inputProps}
                suggestions={this.state.suggestions}
                onSuggestionsFetchRequested={this.onSuggestionsFetchRequested}
                onSuggestionsClearRequested={this.clearSuggestions}
                getSuggestionValue={this.props.objectToString}
                renderSuggestion={this.renderSuggestion}
                onSuggestionSelected={this.onSuggestionSelected}
                theme={{
                    input: inputProps.className
                        ? `react-autosuggest__input ${inputProps.className}`
                        : "react-autosuggest__input",
                    container: "vocabulary-auto-complete-input",
                    suggestion: "suggestion-item",
                    suggestionsList: "suggestions-list",
                    suggestionsContainer: "suggestions-container",
                    suggestionHighlighted: "suggestion-item--highlighted"
                }}
            />
        );
    }
}

export default AutoCompleteInput;
