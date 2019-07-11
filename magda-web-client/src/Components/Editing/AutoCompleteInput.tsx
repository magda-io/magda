import React, { InputHTMLAttributes } from "react";
import Autosuggest from "react-autosuggest";
import throttle from "lodash/throttle";
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

interface Props<T> {
    onSuggestionSelected: (value: T) => void;
    onTypedValueSelected: (value: string) => void;
    query: (query: string) => Promise<T[]>;
    objectToString: (object: T) => string;
}

type PropsWithDefaults<T> = Props<T> &
    DefaultProps<T> &
    InputHTMLAttributes<HTMLInputElement>;

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
        value: ""
    };

    private currentQuery: string = "";
    private key: string = `AutoCompleteInput_${AutoCompleteInput.key++}`;

    throttledQuery = throttle(this.props.query, 500);
    debouncedQuery = debounce(this.props.query, 500);

    getExcludeLookup: (excludes: T[]) => string[] = memoize((excludes: T[]) =>
        keyBy(excludes, exclude =>
            this.props.objectToString(exclude).toLowerCase()
        )
    );

    onSuggestionsFetchRequested = async ({ value }) => {
        let inputValue = typeof value === "string" && value ? value : "";
        inputValue = inputValue.trim().toLowerCase();
        if (!inputValue.length) {
            this.setState(state => ({ ...state, suggestions: [] }));
            return;
        }
        this.currentQuery = inputValue;

        try {
            // --- we respond quicker in the beginning as people need more hints
            // --- and slow down when input content is longer than 5
            const queryFn =
                inputValue.length < 5 || inputValue.endsWith(" ")
                    ? this.throttledQuery
                    : this.debouncedQuery;

            const optionsResult = await queryFn(inputValue);

            if (this.currentQuery !== inputValue) {
                return;
            }

            const options = optionsResult
                .filter(option => {
                    const stringOption = this.props.objectToString(option);

                    return (
                        this.state.value &&
                        (stringOption !== this.state.value &&
                            !this.getExcludeLookup(this.props.exclude)[
                                stringOption.toLowerCase()
                            ])
                    );
                })
                .slice(0, this.props.suggestionSize);

            this.setState(state => ({
                ...state,
                suggestions: options ? options : []
            }));
        } catch (e) {
            console.error(e);
            this.clearSuggestions();
        }
    };

    clearSuggestions = () => {
        this.setState({ suggestions: [] });
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
        console.log(this.getExcludeLookup(this.props.exclude));

        const {
            className: incomingClassName,
            defaultValue,
            suggestionSize,
            onSuggestionSelected,
            onTypedValueSelected,
            query,
            objectToString,
            emptyOnSelect,
            ...restProps
        } = this.props;

        const inputProps = {
            ...restProps,
            onKeyUp: this.onKeyUp,
            onChange: this.onChange,
            value: this.state.value
        };

        return (
            <Autosuggest
                id={this.key}
                inputProps={inputProps}
                suggestions={this.state.suggestions}
                onSuggestionsFetchRequested={this.onSuggestionsFetchRequested}
                onSuggestionsClearRequested={this.clearSuggestions}
                getSuggestionValue={this.props.objectToString}
                renderSuggestion={this.renderSuggestion}
                onSuggestionSelected={this.onSuggestionSelected}
                theme={{
                    input: incomingClassName
                        ? `react-autosuggest__input ${incomingClassName}`
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
