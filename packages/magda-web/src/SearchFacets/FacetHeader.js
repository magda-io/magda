import React, { Component } from 'react';
import './FacetHeader.css';
/**
  * Facet header component, contains a title of the facet and a reset button when there is a active facet
  */
class FacetHeader extends Component {
  calculateTitle(){
    if(this.props.title === "date range"){
        if(this.props.activeOptions.every(o=>!o)){
          return <span> Any date </span>
        } else if(this.props.activeOptions[0] && !this.props.activeOptions[1]){
          return <span> since {this.props.activeOptions[0]}</span>
        } else if(this.props.activeOptions[1] && !this.props.activeOptions[0]){
          return <span> before {this.props.activeOptions[1]}</span>
        } 
        return <span> from {this.props.activeOptions[0]} to {this.props.activeOptions[1]} </span>
    } 
    
    else{
        if( !this.props.activeOptions || this.props.activeOptions.length === 0 || !this.props.activeOptions[0] ||(this.props.title === "location" && !this.props.activeOptions[0].regionType)){
          return <span>{"Any " + this.props.title}</span>;
        } else if(this.props.activeOptions.length === 1){
          return <span>{this.props.activeOptions[0].value || this.props.activeOptions[0].regionType + ": " + this.props.activeOptions[0].regionName}<span className="caret"></span> </span>;
        } else{
          return <span>{this.props.title + ": " + this.props.activeOptions.length} <span className="caret"></span> </span>
        }
    }
  }

  render(){
    return (
      <div className='facet-header'>
        <button className='facet-header__title btn' onClick={this.props.onClick}>{this.calculateTitle()}</button>
      </div>
      );
  }
}

FacetHeader.propTypes = {title: React.PropTypes.string,  activeOptions: React.PropTypes.array};
FacetHeader.defaultProps = {title: ''};

export default FacetHeader;
