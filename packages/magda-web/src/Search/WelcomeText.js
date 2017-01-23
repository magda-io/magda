import './WelcomeText.css';
import React, { Component } from 'react';
import {config} from '../config';

class WelcomeText extends Component {
  constructor(props) {
    super(props);
    this.onClick = this.onClick.bind(this);
  }

  onClick(text, event){
    event.preventDefault();
    this.props.onClick(text);
  }
  render(){
    return (<div className='welcome-text'> <div className='welcome-text__intro'>Try searching for</div>
                <ul className='list-unstyled'>{config.exampleSearch.map(e=>
                      <li key={e}> <a href='#' onClick={this.onClick.bind(this, e)}>{e}</a></li>
                    )}
                </ul>
            </div>);
  }
}

export default WelcomeText;
