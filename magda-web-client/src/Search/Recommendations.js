// @flow
import React, { Component } from 'react';
import find from 'lodash.find';
import './Recommendations.css';

type Option = {
  value: string,
  hitCount: number,
  matched: true
}

type Props = {
  activeOptions: Array<Option>,
  description: string,
  onClick: Function,
  options: Array<Option>
}

class Recommendations extends Component {
  state: {
    isOpen: boolean,
    isVisible: boolean
  }

  constructor(props: Props) {
    super(props);
    this.state = {
      isOpen: false,
      isVisible: true
    }
    // flow type workaround: https://github.com/facebook/flow/issues/1517
    const self: any = this;

    self.onToggle= this.onToggle.bind(this);
    self.onClick = this.onClick.bind(this);
    self.onClickElseWhere=this.onClickElseWhere.bind(this);
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

  onClick(option: Option){
    this.setState({
      isVisible: false
    })
    this.props.onClick(option);
  }

  onToggle(e: MouseEvent){
    e.stopPropagation();
    this.setState({
      isOpen: !this.state.isOpen
    })
  }

  renderOption(option: Option){
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


export default Recommendations;
