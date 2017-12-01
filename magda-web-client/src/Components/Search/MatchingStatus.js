// @flow
import React  from 'react';
import './MatchingStatus.css';

export default function MatchingStatus(
  props: {
      datasets: Array<Object>,
      strategy: string
  },
) {
  if(props.datasets.length > 0){
    if(props.strategy === 'match-part'){
      return <div className='no-matching'>
              Sorry, no dataset matches all of your search criteria.
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
