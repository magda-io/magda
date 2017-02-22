import React, { Component } from 'react';
import find from 'lodash.find';

import './Recommendations.css';
class Recommendations extends Component {
  constructor(props) {
    super(props);
    this.state = {
      isOpen: false,
      isVisible: true
    }
    this.onToggle= this.onToggle.bind(this);
    this.onClick = this.onClick.bind(this);
    this.onClickElseWhere=this.onClickElseWhere.bind(this);
  }

  componentDidMount(){
    // when esc key is pressed at anytime, clear search box and close the search result list
    window.addEventListener('click', this.onClickElseWhere);
    this.setState({
      isVisible: true
    })
  }

  componentWillUnmount(){
    window.removeEventListener('click', this.onClickElseWhere);
  }

  onClickElseWhere(){
    this.setState({
      isOpen: false
    })
  }

  onClick(option){
    this.setState({
      isVisible: false
    })
    this.props.onClick(option);
    // this.props.modifyUserSearchString('by ' + option.value);
  }

  onToggle(e){
    e.stopPropagation();
    this.setState({
      isOpen: !this.state.isOpen
    })
  }

  renderOption(option){
    return <button className='btn-facet-option btn' onClick={this.onClick.bind(this, option)}>
            <span className='btn-facet-option__name'>{option.value}</span>
            <span className='btn-facet-option__count'>{option.hitCount}</span>
          </button>
  }
  render() {
    let suggestedOptions =
    this.props.options.filter(p=>p.matched === true && !find(this.props.activeOptions, (item)=>item.value === p.value));
    if(suggestedOptions.length > 0){

      let topSugguestion = suggestedOptions[0];
      let restOfOptions = suggestedOptions.slice(1, suggestedOptions.length-1);
      return (
        <div className={`search-recomendation clearfix ${this.state.isVisible ? '' : 'hidden'}`} >
            <div className='search-recomendation__main'>
              {this.props.description}
              <button className='search-recomendation__option-btn btn'
                      onClick={this.onClick.bind(this, topSugguestion)}>
                      {topSugguestion.value}
              </button> ?
            </div>
          {restOfOptions.length > 0 &&
            <div className='search-recomendation__more-options'>
              <button onClick={this.onToggle} className='search-recomendation__more-option-btn btn'>
                More
              
              </button>
              {this.state.isOpen &&
                <ul className='list-unstyled search-recomendation__more-options-options'>
                  {restOfOptions.map(o=>
                    <li key={o.value}>{this.renderOption(o)}</li>
                  )}
                </ul>}
            </div>
          }
        </div>
      );
    } else{
      return null;
    }
  }
}
Recommendations.propTypes = {};


export default Recommendations;
