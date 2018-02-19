import React from 'react';
import './Statistics.css';


// Total number of datasets
// - Total number of harvested sources
// - Total number of spatial datasets
// - If time, ElasticSearch query for total number of open licensed datasets

function renderStats(error, loading, value){
  if(error){
    return error.detail
  } else if(loading){
    return <i className="fa fa-spinner fa-spin fa-fw"></i>
  }
    return value && value.toLocaleString()
}


export default function Statistics(props){
  const stats= props.stats;
  return (
    <div className='white-box statistics'>
      <div className='inner'>
          <ul className='mui-list--unstyled'>
              <li>
                  <span className='stats'>{renderStats(stats.fetchDatasetCountError, stats.isFetchingDatasetCount, stats.datasetCount)}</span>
                  <span className='lable'>discoverable datasets</span>
              </li>
              <li>
                  <span className='stats'>25</span>
                  <span className='lable'>harvested sources</span>
              </li>
          </ul>
      </div>
  </div>
  )
}
