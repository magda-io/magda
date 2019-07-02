import React, { InputHTMLAttributes } from "react";
import Autosuggest from "react-autosuggest";
import { query } from "../../helpers/VocabularyApis";
import throttle from "lodash/throttle";
import debounce from "lodash/debounce";
import "./VocabularyAutoCompleteInput.scss";

type StateData = {
    value: string;
    suggestions: string[];
};

interface Props {
    onNewTag: (tag: string) => void;
}

interface DefaultProps {
    suggestionSize: number;
}

type PropsWithDefaults = Props &
    DefaultProps &
    InputHTMLAttributes<HTMLInputElement>;

const throttledQuery = throttle(query, 500);
const debouncedQuery = debounce(query, 500);

class VocabularyAutoCompleteInput extends React.Component<
    PropsWithDefaults,
    StateData
> {
    static defaultProps: DefaultProps = {
        suggestionSize: 10
    };

    readonly state = {
        value: "",
        suggestions: []
    };

    private currentQuery: string;
    private key: string = `VocabularyAutoCompleteInput_${Math.random()}`.replace(
        ".",
        ""
    );

    constructor(props) {
        super(props);
        this.state = {
            value: "",
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
        this.onKeyUp = this.onKeyUp.bind(this);
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

    onKeyUp(event: KeyboardEvent) {
        const value = (event.currentTarget as HTMLInputElement).value.trim();
        if (event.keyCode === 13 && value !== "") {
            this.setState(state => ({
                ...state,
                value: ""
            }));
            if (typeof this.props.onNewTag === "function") {
                this.props.onNewTag(value);
            }
        }
    }

    onChange(event, { newValue }) {
        this.setState(state => ({
            ...state,
            value: newValue
        }));
    }

    onSuggestionSelected(event, { suggestionValue, method }) {
        this.setState(state => ({
            ...state,
            value: ""
        }));
        if (typeof this.props.onNewTag === "function") {
            this.props.onNewTag(suggestionValue);
        }
    }

    render() {
        const {
            className: incomingClassName,
            defaultValue,
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
                onSuggestionsClearRequested={this.onSuggestionsClearRequested}
                getSuggestionValue={getSuggestionValue}
                renderSuggestion={renderSuggestion}
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

const getSuggestionValue = suggestion => suggestion;

const renderSuggestion = suggestion => <div>{suggestion}</div>;

export default VocabularyAutoCompleteInput;
