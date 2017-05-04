import './FacetTemporal.css';
import React, { Component } from 'react';
import FacetHeader from './FacetHeader';
import maxBy from 'lodash.maxby';
import max from 'lodash.max';
import min from 'lodash.min';
import DragBar from './DragBar';
import defined from '../helpers/defined';

// the date range facet facet, extends facet component
class FacetTemporal extends Component {
  constructor(props) {
    super(props);
    this.onResetDateTo = this.onResetDateTo.bind(this);
    this.onResetDateFrom = this.onResetDateFrom.bind(this);
    this.onToggleOption = this.onToggleOption.bind(this);
    this.onToggleOpen = this.onToggleOpen.bind(this);
    this.state = {
      isOpen: false
    }
  }

  onResetDateTo(){
    let datesArray = [this.props.activeDates[0], undefined]
    this.props.onToggleOption(datesArray);
  }

  onResetDateFrom(){
    let datesArray = [undefined, this.props.activeDates[1]]
    this.props.onToggleOption(datesArray);
  }


   /**
    * expand the list (reacting to show more less button )
    */
   onToggleOpen(){
     this.setState({
       isOpen: !this.state.isOpen
     })
   }


  onToggleOption(option){
    let tempDateFrom = this.props.activeDates[0];
    let tempDateTo = this.props.activeDates[1];

    if(!defined(tempDateFrom)){
      // if end date is undefined either, define both
      if(!defined(tempDateTo)){
        tempDateFrom = option.lowerBound;
        tempDateTo = option.upperBound;
      } else{
        // use upper bound here is arbitory
        tempDateTo = option.upperBound;
      }
    } else{
      if(!defined(tempDateTo)){
        tempDateTo = option.upperBound
      } else{
        // date from defined
        // date to defined
        // set both to the new date
        tempDateFrom = option.lowerBound;
        tempDateTo = option.upperBound;
      }
    }
    let compare = tempDateFrom - tempDateTo;
    let dateFrom = compare >= 0 ? tempDateTo : tempDateFrom;
    let dateTo = compare >= 0 ? tempDateFrom : tempDateTo;
    this.props.onToggleOption([dateFrom, dateTo])
  }

  /**
   * Check if current facet option is active(exists in the url)
   * @param {object} option the current facet option
   */
  checkActiveOption(option){
    let max = defined(this.props.activeDates[1]) ? + this.props.activeDates[1] : 4000;
    let min = defined(this.props.activeDates[0]) ? + this.props.activeDates[0] : 0;
    if((option.upperBound <= max) && (option.lowerBound >= min)){
      return true
    }
    return false
  }

  renderOption(option, onClick){
    if(!option){
      return null;
    }
    let divStyle = {
      width: +option.hitCount/maxBy(this.props.options, 'hitCount').hitCount * 160 + 'px'
    }

    return (
    <button type='button'
            className={`${this.checkActiveOption(option) ? 'is-active' : ''} btn-facet-option btn-facet-date-option btn`}
            onClick={onClick.bind(this, option)}
            >
      <span style={divStyle} className='btn-facet-option__volume-indicator'/>
      <span className='btn-facet-option__name'>{option.value}</span>
      <span className='btn-facet-option__action'><i className={`fa fa-check`}/></span>
      <span className='btn-facet-option__count'>{option.hitCount}</span>
    </button>)
  }



  findLowerBound(){
    // find all bound and pick the smallest index
    let indice = [];
    this.props.options.forEach((o, i)=>{
      if(this.checkActiveOption(o)){
        indice.push(i)
      }
    });
    return indice.length > 0 ? max(indice) + 1 : this.props.options.length + 1;
  }

  findUpperBound(){
    // find all bounds and pick the highest
    let indice = [];
    this.props.options.forEach((o, i)=>{
      if(this.checkActiveOption(o)){
        indice.push(i)
      }
    });

    return indice.length > 0 ? min(indice) + 1 : 0;

  }


  render(){
    let that = this;
    return <div className="facet-wrapper">
            <FacetHeader onResetFacet={this.props.onResetFacet}
                     title={this.props.title}
                     activeOptions={this.props.activeDates}
                     hasQuery={this.props.hasQuery}
                     onClick={this.onToggleOpen}/>
             {this.state.isOpen && <div className='clearfix facet-temporal facet-body'>
               <ul className='list-unstyled list'>
                <li><button className='btn btn-facet-option btn-facet-date-option' onClick={this.onResetDateTo}>Any end date </button></li>
                 {that.props.options.map(o=><li key={o.value}>{that.renderOption(o, this.onToggleOption)}</li>)}
                 <li><button className='btn btn-facet-option btn-facet-date-option' onClick={this.onResetDateFrom}>Any start date </button></li>
               </ul>
             </div>
           }
           </div>
  }
}

export default FacetTemporal;
