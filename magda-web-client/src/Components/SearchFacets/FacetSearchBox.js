import React, { Component } from 'react';
import './FacetSearchBox.css';
import debounce from 'lodash.debounce';
import Form from 'muicss/lib/react/form';
import Input from 'muicss/lib/react/input';
import Autosuggest from 'react-autosuggest';

// Teach Autosuggest how to calculate suggestions for any given input value.
const getSuggestions = (source, value) => {
  const inputValue = value.trim().toLowerCase();
  const inputLength = inputValue.length;

  return inputLength === 0 ? [] : source.filter(s =>
    s.value.toLowerCase().slice(0, inputLength) === inputValue
  );
};

// When suggestion is clicked, Autosuggest needs to populate the input
// based on the clicked suggestion. Teach Autosuggest how to calculate the
// input value for every given suggestion.
const getSuggestionValue = suggestion => suggestion.value;

/**
  * Searchbox for facet facet
  */
class FacetSearchBox extends Component {
  constructor(props) {
    super(props);
    this.onSuggestionSelected = this.onSuggestionSelected.bind(this);
    this.state = {
      value: '',
      suggestions: []
    };
  }


  onChange = (event, { newValue }) => {
     this.setState({
       value: newValue
     });
     this.props.searchBoxValueChange(newValue);
   };


  onSuggestionsFetchRequested = ({ value }) => {
    this.setState({
      suggestions: getSuggestions(this.props.options, value)
    });
  };

  // Autosuggest will call this function every time you need to clear suggestions.
  onSuggestionsClearRequested = () => {
    this.setState({
      suggestions: []
    });
  };

  renderSuggestion(suggestion){
    return <div className='btn-facet-option__name'>
        {suggestion.value}{' '}({suggestion.hitCount})
      </div>
  }

  onSuggestionSelected(event, {suggestion}){
    this.props.onToggleOption(suggestion);
    this.onChange(null, {newValue: ''});
  }


  render(){
    const { value, suggestions } = this.state;

    // Autosuggest will pass through all these props to the input.
    const inputProps = {
      placeholder: 'Search',
      value,
      onChange: this.onChange
    };

    // Finally, render it!
    return (
      <Autosuggest
        suggestions={suggestions}
        onSuggestionsFetchRequested={this.onSuggestionsFetchRequested}
        onSuggestionsClearRequested={this.onSuggestionsClearRequested}
        getSuggestionValue={getSuggestionValue}
        renderSuggestion={this.renderSuggestion}
        inputProps={inputProps}
        onSuggestionSelected={this.onSuggestionSelected}
      />
    );
  }
}

FacetSearchBox.defaultProps = {options: []};

export default FacetSearchBox;
