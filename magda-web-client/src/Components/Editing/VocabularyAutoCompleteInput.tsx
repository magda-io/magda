import React from "react";
import Autosuggest from "react-autosuggest";
import { query } from "../../helpers/VocabularyApis";
import throttle from "lodash/throttle";
import debounce from "lodash/debounce";

type StateData = {
    value: string;
    suggestions: string[];
};

type Prop = {
    [key: string]: any;
};

const throttledQuery = throttle(query, 500);
const debouncedQuery = debounce(query, 500);

class VocabularyAutoCompleteInput extends React.Component<Prop, StateData> {
    private currentQuery: string;

    constructor(props) {
        super(props);
        this.state = {
            value: props.defaultValue,
            suggestions: []
        };
        this.currentQuery = "";
        this.onSuggestionsFetchRequested = this.onSuggestionsFetchRequested.bind(
            this
        );
        this.onSuggestionsClearRequested = this.onSuggestionsClearRequested.bind(
            this
        );
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

        let keywords: string[];
        if (inputValue.length < 5 || inputValue.endsWith(" ")) {
            keywords = await throttledQuery(inputValue);
        } else {
            keywords = await debouncedQuery(inputValue);
        }
        if (this.currentQuery !== inputValue) {
            return;
        }
        this.setState(state => ({ ...state, suggestions: keywords }));
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

    render() {
        const {
            className: incomingClassName,
            onChange: incomingOnChange,
            defaultValue,
            ...restProps
        } = this.props;

        const inputProps = {
            ...restProps,
            onChange: this.onChange,
            value: this.state.value
        };

        return (
            <Autosuggest
                inputProps={inputProps}
                suggestions={this.state.suggestions}
                onSuggestionsFetchRequested={this.onSuggestionsFetchRequested}
                onSuggestionsClearRequested={this.onSuggestionsClearRequested}
                getSuggestionValue={getSuggestionValue}
                renderSuggestion={renderSuggestion}
                theme={{
                    input: incomingClassName
                        ? `react-autosuggest__input ${incomingClassName}`
                        : "react-autosuggest__input"
                }}
            />
        );
    }
}

const getSuggestionValue = suggestion => suggestion;

const renderSuggestion = suggestion => <div>{suggestion}</div>;

export default VocabularyAutoCompleteInput;
