import React, { Component } from 'react';
import FacetWrapper from './FacetWrapper';
import find from 'lodash.find';
import maxBy from 'lodash.maxby';
import defined from '../helpers/defined';
import FacetSearchBox from './FacetSearchBox';


// extends Facet class
class FacetBasic extends Component {
  constructor(props) {
    super(props);
    this.renderOption=this.renderOption.bind(this);
  }
/**
 * check is this option can be found in the list of activeOptions
 * @param {object} option the current option to render
 */
  checkActiveOption(option){
    return find(this.props.activeOptions, o=> o.value === option.value);
  }

/**
 * generate the html for a option of this filter
 * @param {object} option the current option to render
 * @param {object} optionMax the option with the max value of object.value, this is uased to calculate the width of the volumne indicator
 * @param {function} callback a function that get called after user clicks on this option
 * @param {boolean} onFocus whether this option should be in focus or not
 */
  renderOption(option, optionMax, callback, onFocus, _isActive){
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
            onClick={this.props.toggleOption.bind(this, option, callback)}>
      <span style={divStyle} className='btn-facet-option__volume-indicator'/>
      <span className='btn-facet-option__name'>{option.value}{option.matched && <span className='btn-facet-option__recomended-badge'>(recomended)</span>}</span>
      <span className='btn-facet-option__action'><i className={`fa fa-${isActive ? 'times' : 'plus'}`}/></span>
      <span className='btn-facet-option__count'>{option.hitCount}</span>
    </button>);
  }


  render(){
    let that = this;
    let maxOptionOptionList = maxBy(this.props.options, o=> +o.hitCount);
    return <FacetWrapper onResetFacet={this.props.onResetFacet}
                         title={this.props.title}
                         activeOptions={this.props.activeOptions}>
               <FacetSearchBox renderOption={this.renderOption}
                               options={this.props.facetSearchResults}
                               searchFacet={this.props.searchFacet}/>
               <ul className='list-unstyled'>
                 {that.props.activeOptions.map(o=><li key={o.value}>{that.renderOption(o, maxOptionOptionList)}</li>)}
               </ul>
               <ul className='list-unstyled'>
                 {that.props.options.filter(o=>!that.checkActiveOption(o)).map(o=><li key={o.value}>{that.renderOption(o, maxOptionOptionList)}</li>)}
               </ul>
           </FacetWrapper>
  }
}

export default FacetBasic;
