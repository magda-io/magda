import React, { Component } from 'react';
import './FacetHeader.css';
/**
  * Facet header component, contains a title of the facet and a reset button when there is a active facet
  */
class FacetHeader extends Component {
  calculateTitle(){
    if(this.props.title === 'date range'){
        if(!this.hasFilter()){
          return <span> Any date </span>
        } else if(this.props.activeOptions[0] && !this.props.activeOptions[1]){
          return <span> since {this.props.activeOptions[0]}</span>
        } else if(this.props.activeOptions[1] && !this.props.activeOptions[0]){
          return <span> before {this.props.activeOptions[1]}</span>
        }
        return <span> from {this.props.activeOptions[0]} to {this.props.activeOptions[1]} </span>
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
        <button className={`facet-header__title btn ${this.hasFilter() ? 'not-empty': ''}`} onClick={this.props.onClick}>{this.calculateTitle()}<span className='caret'></span></button>
      </div>
      );
  }
}

FacetHeader.defaultProps = {title: ''};

export default FacetHeader;
