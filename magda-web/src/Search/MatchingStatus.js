// @flow
import React, { Component } from 'react';
import './MatchingStatus.css';

export default class MatchingStatus extends Component {
  props: {
      datasets: Array<Object>,
      strategy: string
  }

  render(){
    if(this.props.datasets.length > 0){
      if(this.props.strategy === 'match-part'){
        return <div className='no-matching'>
                Sorry, no dataset match all of your search criteria.
              </div>
      } else{
        return null
      }
    } else {
      return <div className='no-matching'>
              Sorry, we can not find what you were looking for. Please try modifying your search.
            </div>
    }
  }
}
