import React, { Component } from 'react';
import './FacetHeader.css';
import Button from 'muicss/lib/react/button';
/**
  * Facet header component, contains a title of the facet and a reset button when there is a active facet
  */
class FacetHeader extends Component {
  displayMonth(date){
    return new Date(date).getUTCFullYear() + '/' + new Date(date).getUTCMonth()
  }
  calculateTitle(){
    if(this.props.title === 'date range'){
        if(!this.hasFilter()){
          return <span> Any date </span>
        } else if(this.props.activeOptions[0] && !this.props.activeOptions[1]){
          return <span> since {this.displayMonth(this.props.activeOptions[0])}</span>
        } else if(this.props.activeOptions[1] && !this.props.activeOptions[0]){
          return <span> before {this.displayMonth(this.props.activeOptions[1])}</span>
        }
        return <span> from {this.displayMonth(this.props.activeOptions[0])} to {this.displayMonth(this.props.activeOptions[1])} </span>
    }

    else{
        if(!this.hasFilter()){
          return <span>{'Any ' + this.props.title}</span>;
        } else if(this.props.activeOptions.length === 1){
          return <span>{this.props.activeOptions[0].value || this.props.activeOptions[0].regionType + ': ' + this.props.activeOptions[0].regionName} </span>;
        } else{
          return <span>{this.props.title + ': ' + this.props.activeOptions.length}  </span>
        }
    }
  }

  hasFilter(){
    let hasFilter = true;
    if(this.props.title === 'date range'){
      if(this.props.activeOptions.every(o=>!o)){
        hasFilter = false;
      }
    } else{
      if( !this.props.activeOptions || this.props.activeOptions.length === 0 || !this.props.activeOptions[0] ||(this.props.title === 'location' && !this.props.activeOptions[0].regionType)){
        hasFilter = false;
      }
    }
    return hasFilter;
  }

  render(){
    return (
      <div className='facet-header'>
        <Button className={`${this.hasFilter() ? 'not-empty': ''} ${this.props.isOpen ? 'is-open' : ''}`} onClick={this.props.onClick}>{this.calculateTitle()}</Button>
      </div>
      );
  }
}

FacetHeader.defaultProps = {title: ''};

export default FacetHeader;
