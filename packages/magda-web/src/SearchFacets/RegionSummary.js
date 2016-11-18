import defined from '../helpers/defined';
import React from 'react';

function RegionSummray(props){
  if(defined(props.region.regionType)){
    return <div className='active-region'>
              {props.region.name}
              {props.region.regionType}
              {props.region.regionId}
            </div>
  } else{
    return null;
  }
}

export default RegionSummray;
