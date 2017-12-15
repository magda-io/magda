import React from 'react';
import ReactDocumentTitle from 'react-document-title';
import {config} from '../config' ;
import FacetSearchBox from '../Components/SearchFacets/FacetSearchBox';
import ContactForm from '../UI/ContactForm';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import {fetchPublisherSearchResults} from '../actions/facetPublisherSearchActions';

class Contact extends React.Component {
  constructor(props) {
    super(props);
    this.onSearchPublisherFacet = this.onSearchPublisherFacet.bind(this);
    this.selectPublisher = this.selectPublisher.bind(this);
  }

  componentDidMount() {

  }

  onSearchPublisherFacet(facetKeyword){
    this.props.fetchPublisherSearchResults('*', facetKeyword);
  }

  renderOption(option, onClick, optionMax, onFocus){
    if(!option){
      return null;
    }

    return(
    <button type='button'
            onClick={onClick.bind(this, option)}
            title={option.value}>
        {option.value}
    </button>);
  }

  selectPublisher(publisher){
    console.log(publisher);
  }

  render() {
    return (
      <ReactDocumentTitle title={config.appName + ' | contact'}>
        <div className='container contact'>
          <h1>Get in contact with the team that runs {config.appName}</h1>
          <ContactForm/>
          <h2>After a specific dataset?</h2>
          <p>Try searching for an organization</p>
          <FacetSearchBox renderOption={this.renderOption}
                          options={this.props.publisherSearchResults}
                          onToggleOption={this.selectPublisher}
                          searchFacet={this.onSearchPublisherFacet}/>
        </div>
      </ReactDocumentTitle>
    );
  }
}

function mapStateToProps(state) {
  let {facetPublisherSearch} = state;
    return {
      publisherSearchResults: facetPublisherSearch.data
  };
}

const mapDispatchToProps = (dispatch: Dispatch<*>) => {
  return bindActionCreators(
    { fetchPublisherSearchResults : fetchPublisherSearchResults
    },
    dispatch
  );
};



export default connect(mapStateToProps, mapDispatchToProps)(Contact);
