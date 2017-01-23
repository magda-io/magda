import React, { Component } from 'react';
import './NoMatching.css';

export default class NoMatching extends Component {
  render(){
    if(this.props.datasets.length > 0){
      if(this.props.strategy === 'match-part'){
        return <div className='no-matching'>
                Sorry we can not find what you were looking for, you might find the following related datasets useful?
              </div>
      } else{
        return null
      }
    } else {
      return <div className='no-matching'>
              Sorry we can not find what you were looking for. Please try modify your search
            </div>
    }
  }
}
