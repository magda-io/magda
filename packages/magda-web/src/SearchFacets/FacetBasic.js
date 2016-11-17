import React, { Component } from 'react';
import FacetWrapper from './FacetWrapper';
import find from 'lodash.find';
import maxBy from 'lodash.maxby';
import defined from '../helpers/defined';
import FacetSearchBox from './FacetSearchBox';
import config from '../config.js'

// extends Facet class
class FacetBasic extends Component {
  constructor(props) {
    super(props);
    this.renderOption=this.renderOption.bind(this);
    this.toggleExpand= this.toggleExpand.bind(this);
    this.state = {
      isExpanded: false
    }
  }
/**
 * check is this option can be found in the list of activeOptions
 * @param {object} option the current option to render
 */
  checkActiveOption(option){
    return find(this.props.activeOptions, o=> o.value === option.value);
  }
  /**
    * expand the list (reacting to show more less button )
    */
   toggleExpand(){
     this.setState({
       isExpanded: !this.state.isExpanded
     })
   }

/**
 * generate the html for a option of this filter
 * @param {object} option the current option to render
 * @param {object} optionMax the option with the max value of object.value, this is uased to calculate the width of the volumne indicator
 * @param {function} onClick when clicked
 * @param {boolean} onFocus whether this option should be in focus or not
 */
  renderOption(option, onClick, optionMax, onFocus){
    if(!option){
      return null;
    }
    let maxWidth = defined(optionMax) ? +option.hitCount/optionMax.hitCount * 200 : 0;
    let divStyle = {width: maxWidth + 'px'}
    let isActive = this.checkActiveOption(option);

    return(
    <button type='button'
            ref={b=>{if(b != null && onFocus === true){b.focus()}}}
            className={`${isActive ? 'is-active' : ''} btn-facet-option btn`}
            onClick={onClick.bind(this, option)}>
      <span style={divStyle} className='btn-facet-option__volume-indicator'/>
      <span className='btn-facet-option__name'>{option.value}{(option.matched && !isActive) && <span className='btn-facet-option__recomended-badge'>(recomended)</span>}</span>
      <span className='btn-facet-option__action'><i className={`fa fa-${isActive ? 'times' : 'plus'}`}/></span>
      <span className='btn-facet-option__count'>{option.hitCount}</span>
    </button>);
  }


  render(){
    let that = this;
    let defaultSize = config().facetListSize;
    // default list of options to display for the facet filter except those already active, which will be displayed in a seperate list
    let inactiveOptions = this.props.options.filter(o=>!this.checkActiveOption(o));
    // the option that has the max object.value value, use to calculate volumne indicator
    let maxOptionOptionList = maxBy(this.props.options, o=> +o.hitCount);
    // the size of the list visible by default, it should either be DEFAULTSIZE or the size of the list if there's no overflow
    let tempSize = defaultSize > inactiveOptions.length ? inactiveOptions.length : defaultSize;
    // the size of list to display, depends on whether the list is expanded or not
    let size = this.state.isExpanded ? inactiveOptions.length : tempSize;

    return <FacetWrapper onResetFacet={this.props.onResetFacet}
                         title={this.props.title}
                         activeOptions={this.props.activeOptions}
                         hasQuery={this.props.hasQuery}>
               <FacetSearchBox renderOption={this.renderOption}
                               options={this.props.facetSearchResults}
                               onToggleOption={this.props.onToggleOption}
                               searchFacet={this.props.searchFacet}
                               />
               <ul className='list-unstyled'>
                 {that.props.activeOptions.sort((a, b)=>b.hitCount - a.hitCount).map(o=><li key={`${o.value}-${o.hitCount}`}>{that.renderOption(o, this.props.onToggleOption, maxOptionOptionList)}</li>)}
               </ul>
               <ul className='list-unstyled'>
                 {inactiveOptions.slice(0, size).map(o=><li key={`${o.value}-${o.hitCount}`}>{that.renderOption(o, this.props.onToggleOption, maxOptionOptionList)}</li>)}
                 {inactiveOptions.length - tempSize > 0 &&
                   <li><button onClick={this.toggleExpand}
                           className='btn btn-toggle-expand'>
                            {this.state.isExpanded ? `Show less` : `Show ${inactiveOptions.length - tempSize} more`}
                  </button></li>}
               </ul>

           </FacetWrapper>
  }
}

export default FacetBasic;
