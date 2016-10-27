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
      loadingProgress: 0,
      activeOptions: []
    }

    this.searchFilter = this.searchFilter.bind(this);
    this.renderOption = this.renderOption.bind(this);
    this.removeFilter = this.removeFilter.bind(this);
    this.toggleOption= this.toggleOption.bind(this);
    this.toggleOpen = this.toggleOpen.bind(this);
    this.updateProgress = this.updateProgress.bind(this);
  }


  componentWillMount(){
    this.getActiveOptions();
  }

  getActiveOptions(){
    let query = this.props.location.query[this.props.id];
    if(!defined(query)){
      return false;
    } else {
      if(!Array.isArray(query)){
       query = [query];
      }
      let tempList = [];
      query.forEach(item=>{
          // search locally first
          if(defined(this.props.options) && this.props.options.length > 0){
            let option = find(this.props.options, o=>o.value === item);
            if(defined(option)){
              tempList.push(option);
              this.setState({
                activeOptions : tempList
              });
            } else{
              // search remotely
              this.remotelySearchOption(item, tempList);
            }
          } else{
            // search remotely
            this.remotelySearchOption(item, tempList);
          }
      });
    }
  }

  /**
   * if a option from the url does not exist in the default list of filters, we need to remotely search for it to get the hitcount
   * @param {string} item, the option we get from the url, corresponding the [value] of a filter option
   * @param {Array} tempList current list of active options
   */
  remotelySearchOption(item, tempList){
      // take each of the item and search on server to get the accurate hticount for each one
       getJSON(`${this.props.facetSearchQueryBase}${encodeURI(item)}`).then((data)=>{
           let option = data.options.find(o=>o.value === item);
           // if we cannot find the publisher
           if(!defined(option)){
             option ={
               value: item,
               hitCount: 'unknown'
             }
           }
           tempList.push(option);

           this.setState({
             activeOptions : tempList
           });

       }, (err)=>{console.warn(err)});
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
   * search for a specific facet option
   * @param {string} searchText, the text user type in the input box inside the facet filter
   */
  searchFilter(searchText){
    this.setState({
      loadingProgress: 0
    });

    getJSON(`${this.props.facetSearchQueryBase}${searchText}`,
       this.updateProgress
     ).then((data)=>{
        this.setState({
          options: data.options
        })
    }, (err)=>{console.warn(err)});
  }

  /**
   * enable and disable this filter option
   * @param {object}  option, the current filter option
   * @param {boolean} allowMultiple wether if multiple options can be activited at the same time. For example, we can have multiple publishers turned on but we can only have one jurisdiction at one time
   * @param {function} callback defines what happens when the toggle action is done, for example, when searching the filter, the input box should be cleared once user clicks on a option from the filter search result list
   */

  toggleOption(option, allowMultiple, callback){
    // get the updated query, firstly chck if multiple values of the same facet are allowed, if so, merge the current value with existing value, otherwise, replace the facet value with the current one
    let query = toggleQuery(option, this.props.location.query[this.props.id], allowMultiple);

    // update url using the new values of this facet
    this.props.updateQuery({[this.props.id]: query});

    // if callback function is defined, do the callback
    if(defined(callback) && typeof callback ==='function'){
      callback();
    }

    // update list of all options
    this.getActiveOptions();
  }

  /**
   * reset the filter === remove any filters of this facet
   */
  removeFilter(){
    // remove query in the url
    this.props.updateQuery({[this.props.id]: []});
    this.setState({
      activeOptions: []
    })
  }

  /**
   * open the result list when user starts typing in the search box
   */
  toggleOpen(){
    this.setState({
      isOpen: !this.state.isOpen
    })
  }

  /**
   * monitor loading progress of the current request
   * @param {object} oEvent loading event
   */
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

  /**
   * generate the html for a option of this filter
   * @param {object} option the current option to render
   * @param {object} optionMax the option with the max value of object.value, this is uased to calculate the width of the volumne indicator
   * @param {function} callback a function that get called after user clicks on this option
   * @param {boolean} onFocus whether this option should be in focus or not
   */
  renderOption(option, optionMax, callback, onFocus, _isActive){
    let allowMultiple = true;

    if(!option){
      return null;
    }
    let maxWidth = defined(optionMax) ? +option.hitCount/optionMax.hitCount * 200 : 0;
    let divStyle = {width: maxWidth + 'px'}
    let isActive = defined(_isActive) ? _isActive : this.checkActiveOption(option);

    return(
    <button type='button'
            ref={b=>{if(b != null && onFocus === true){b.focus()}}}
            className={`${isActive ? 'is-active' : ''} btn-facet-option btn`}
            onClick={this.toggleOption.bind(this, option, allowMultiple, callback)}>
      <span style={divStyle} className='btn-facet-option__volume-indicator'/>
      <span className='btn-facet-option__name'>{option.value}{option.matched && <span className='btn-facet-option__recomended-badge'>(recomended)</span>}</span>
      <span className='btn-facet-option__action'><i className={`fa fa-${isActive ? 'times' : 'plus'}`}/></span>
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


  renderActiveOptions(){
    if(defined(this.state.activeOptions) && this.state.activeOptions.length > 0){
      return this.state.activeOptions.map((o, i)=>{
        return <li key={o.value + i}>{this.renderOption(o, null, null, null, true)}</li>;
      })
    }
  }


  render() {
    // default list of options to display for the facet filter except those already active, which will be displayed in a seperate list
    let inactiveOptions = this.props.options.filter(o=>!this.checkActiveOption(o));
    // the option that has the max object.value value, use to calculate volumne indicator
    let maxOptionFromDefaultOptionList = maxBy(this.props.options, o=> +o.hitCount);
    // the size of the list visible by default, it should either be DEFAULTSIZE or the size of the list if there's no overflow
    let tempSize =  DEFAULTSIZE > inactiveOptions.length ? inactiveOptions.length : DEFAULTSIZE;
    // the size of list to display, depends on whether the list is expanded or not
    let size = this.state.isOpen ? inactiveOptions.length : tempSize;
    // is the number of facet options to display more than the default size? if so, we should hide the overflow and provide a "show more" button
    let overflow = inactiveOptions.length - tempSize;

    return (
      <div className='filter'>
        <FilterHeader query={this.props.location.query[this.props.id]}
                      removeFilter={this.removeFilter}
                      title={this.props.title}/>

        <FilterSearchBox allowMultiple={true}
                         clearSearch={this.clearSearch}
                         searchFilter={this.searchFilter}
                         loadingProgress={this.state.loadingProgress}
                         renderOption={this.renderOption}
                         toggleOption={this.toggleOption}
                         options={this.state.options}

        />

        <ul className='list-unstyled active-options'>
          {this.renderActiveOptions()}
        </ul>

        <ul className='other-options list-unstyled'>
        {inactiveOptions.slice(0, size).map((option, i)=>
              <li key={option.value}>{this.renderOption(option,maxOptionFromDefaultOptionList)}</li>
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
                    location: React.PropTypes.object,
                    updateQuery: React.PropTypes.func};

Filter.defaultProps = {options: []};

RegExp.escape = function(str)
{
  var specials = new RegExp("[.*+?|()\\[\\]{}\\\\]", "g"); // .*+?|()[]{}\
  return str.replace(specials, "\\$&");
}

export default Filter;
