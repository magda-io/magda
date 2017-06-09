// @flow
import React, { Component } from 'react';
import { Link } from 'react-router';
import type { Stats } from '../types';
import './Statistics.css';

// Total number of datasets
// - Total number of harvested sources
// - Total number of spatial datasets
// - If time, ElasticSearch query for total number of open licensed datasets

function renderStats(error: ?number, loading: boolean, value: ?number){
  if(error){
    return "error loading stats"
  } else if(loading){
    return <i className="fa fa-spinner fa-spin fa-fw"></i>
  }
    return value.toLocaleString()
}


export default function Statistics(props: {stats: Stats}){
  const stats: Stats = props.stats;
  return (
    <div className='white-box statistics'>
      <div className='inner'>

          <ul className='list-unstyled'>
              <li>
                  <strong><span>{renderStats(stats.fetchDatasetCountError, stats.isFetchingDatasetCount, stats.datasetCount)}</span></strong>
                  discoverable datasets
              </li>
              <li>
                  <strong><span>773</span></strong>
                  harvested sources
              </li>
              <li>
                  <strong><span>23,000</span></strong>
                  spatial datasets
              </li>
          </ul>
      </div>
  </div>
  )
}
