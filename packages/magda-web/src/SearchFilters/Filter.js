const DEFAULTSIZE = 5;
import './Filter.css';
import checkActiveOption from '../checkActiveOption';
import defined from '../defined';
import FilterHeader from './FilterHeader';
import FilterSearchBox from './FilterSearchBox';
import find from 'lodash.find';
import getJSON from'../getJSON';
import maxBy from 'lodash.maxby';
import React, { Component } from 'react';
import toggleQuery from '../toggleQuery';

/**
  * Facet Filter component, for example, publisher filter, location filter, format filter, temporal filter
  */

class Filter extends Component {
  constructor(props) {
    super(props);

    /**
     * @type {object}
     * @property {boolean} isOpen when searching inside this facet, the result list is open or not
     * @property {array} options when searching inside this facet, the result list of this facet
     * @property {number} loadingProgress the percentage of the search progress
     */
    this.state={
      isOpen: false,
      options: [],
      loadingProgress: 0
    }

    this.searchFilter = this.searchFilter.bind(this);
    this.renderOption = this.renderOption.bind(this);
    this.resetFilter = this.resetFilter.bind(this);
    this.toggleFilter= this.toggleFilter.bind(this);
    this.toggleOpen = this.toggleOpen.bind(this);
    this.updateProgress = this.updateProgress.bind(this);
  }


  componentDidMount(){
    // when esc key is pressed at anytime, clear search box and close the search result list
    window.addEventListener('keydown', (event)=>{
      if(event.which === 27){
        this.clearSearch();
      }
    });
  }


  /**
   * search for a spefic facet option
   * @param {string} searchText, the text user type in the input box inside the facet filter
   */
  searchFilter(searchText){

    this.setState({
      loadingProgress: 0
    });

    let keyword = this.props.location.query.q.split(' ').join('+');

    // when searching facets, we need to change "publishers" and "formats" into "publisher" and "format"
    let facet = this.props.id.replace(/s+$/, "");

    getJSON(`http://ec2-52-65-238-161.ap-southeast-2.compute.amazonaws.com:9000/facets/${facet}/options/search?query=${keyword}`,
       this.updateProgress
     ).then((data)=>{
       let filteredOptions = [];

      // if the searchText is part of the option value string, consider we found a match
      data.options.forEach((c)=>{
        if(c.value.toLowerCase().indexOf(searchText.toLowerCase())!==-1){
          filteredOptions.push(c);
        }
      });

      this.setState({
        options: filteredOptions
      })

    }, (err)=>{console.warn(err)});
  }


  toggleFilter(option, allowMultiple, callback){
    let query = toggleQuery(option, this.props.location.query[this.props.id], allowMultiple);

    // update url
    this.props.updateQuery({[this.props.id]: query});

    if(defined(callback) && typeof callback ==='function'){
      callback();
    }
  }


  resetFilter(){
    // remove query in the url
    this.props.updateQuery({[this.props.id]: []});
  }


  toggleOpen(){
    // open the result list when user starts typing in the search box
    this.setState({
      isOpen: !this.state.isOpen
    })
  }


  updateProgress (oEvent) {
    if (oEvent.lengthComputable) {
      this.setState({
        loadingProgress: oEvent.loaded / oEvent.total
      })
    } else {
      // Unable to compute progress information since the total size is unknown
      console.log('Unable to compute progress information since the total size is unknown');
    }
  }

  renderOption(option, optionMax, callback, onFocus){
    let allowMultiple = true;

    if(!option){
      return null;
    }
    let maxWidth = defined(optionMax) ? +option.hitCount/optionMax.hitCount * 200 : 0;
    let divStyle = {width: maxWidth + 'px'}

    return(
    <button type='button'
            ref={b=>{if(b != null && onFocus === true){b.focus()}}}
            className={`${this.checkActiveOption(option) ? 'is-active' : ''} btn-facet-option btn`}
            onClick={this.toggleFilter.bind(this, option, allowMultiple, callback)}>
      <span style={divStyle} className='btn-facet-option__volume-indicator'/>
      <span className='btn-facet-option__name'>{option.value}{option.matched && <span className='btn-facet-option__recomended-badge'>(recomended)</span>}</span>
      <span className='btn-facet-option__action'><i className={`fa fa-${this.checkActiveOption(option) ? 'times' : 'plus'}`}/></span>
      <span className='btn-facet-option__count'>{option.hitCount}</span>
    </button>);
  }

  /**
   * check if this option is already active
   * @param {string} option, an option from this facet filter
   */
  checkActiveOption(option){
    let query = this.props.location.query[this.props.id];
    return checkActiveOption(option, query);
  }


  /**
   * get a list of all active options from the url
   */
  getActiveOption(){
    let query = this.props.location.query[this.props.id];
    if(!query){
      return null;
    }
    if(!Array.isArray(query)){
     query = [query];
   }
   return query.map(item=>{
     let correspondingOptionInDefaultList = find(this.props.options, o=>o.value === item);

     let hitCount = defined(correspondingOptionInDefaultList) ? correspondingOptionInDefaultList.hitCount : 0;
     let option = {'value': item, 'hitCount': hitCount}
     return <li key={item}>{this.renderOption(option)}</li>;
   });
  }


  render() {
    let inactiveOptions = this.props.options.filter(o=>!this.checkActiveOption(o));
    let maxOptionFromDefaultOptionList = maxBy(this.props.options, o=> +o.hitCount);
    let tempSize =  DEFAULTSIZE > inactiveOptions.length ? inactiveOptions.length : DEFAULTSIZE;
    let size = this.state.isOpen ? inactiveOptions.length : tempSize;

    // is the number of facet options to display more than the default size? if so, we should hide the overflow and provide a "show more" button
    let overflow = inactiveOptions.length - tempSize;

    return (
      <div className='filter'>
        <FilterHeader query={this.props.location.query[this.props.id]}
                      resetFilter={this.resetFilter}
                      title={this.props.title}/>

        <FilterSearchBox allowMultiple={true}
                         clearSearch={this.clearSearch}
                         searchFilter={this.searchFilter}
                         loadingProgress={this.state.loadingProgress}
                         renderOption={this.renderOption}
                         toggleFilter={this.toggleFilter}
                         options={this.state.options}

        />

        <ul className='list-unstyled active-options'>
          {this.getActiveOption()}
        </ul>

        <ul className='other-options list-unstyled'>
        {inactiveOptions.slice(0, size).map((option, i)=>
              <li key={i}>{this.renderOption(option,maxOptionFromDefaultOptionList)}</li>
        )}
        </ul>
        {overflow > 0 && <button onClick={this.toggleOpen}
                                 className='btn btn-toggle'>
                                    {this.state.isOpen ? `Show less ${this.props.title}s` : `Show ${overflow} more`}
                          </button>}

      </div>
    );
  }
}

Filter.propTypes = {options: React.PropTypes.array,
                    title: React.PropTypes.string,
                    id: React.PropTypes.string,
                    toggleFilter: React.PropTypes.func,
                    location: React.PropTypes.object,
                    updateQuery: React.PropTypes.func};

Filter.defaultProps = {options: []};

RegExp.escape = function(str)
{
  var specials = new RegExp("[.*+?|()\\[\\]{}\\\\]", "g"); // .*+?|()[]{}\
  return str.replace(specials, "\\$&");
}

export default Filter;
