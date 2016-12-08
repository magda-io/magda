import defined from '../helpers/defined';
import React from 'react';

function RegionSummary(props){
	const name = props.region.regionName || '';
	const typeName = defined(props.regionMapping) &&
                   defined(props.regionMapping[props.region.regionType]) ?
                   props.regionMapping[props.region.regionType].description : '';
  if(name.length > 0 || typeName.length > 0){
    return <div className='active-region'>
              {name}
              <div className='region-type'>
              	{typeName}
              </div>
            </div>
  } else{
    return null;
  }
}

export default RegionSummary;
