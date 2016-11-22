import defined from '../helpers/defined';
import React from 'react';

function RegionSummray(props){
  if(defined(props.region.regionType)){
    return <div className='active-region'>
              {props.region.regionName}
            </div>
  } else{
    return null;
  }
}

export default RegionSummray;
