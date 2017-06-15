// @flow
import CustomIcons from '../UI/CustomIcons';
import React from 'react';
import { Link } from 'react-router';
import './Distribution.css';

export default function renderDistribution(distributionFormat: string, distributionId: string, distributionTitle: string, distributionLicense: string, datasetId: string){
  return <div className={`distribution media clearfix ${distributionFormat} distribution__media-object`} key={distributionId}>
          <div className='media-left'>
          <CustomIcons name={distributionFormat}/>
          </div>
          <div className='media-body'>
           <h3><Link to={`/dataset/${datasetId}/distribution/${distributionId}`}>{distributionTitle}({distributionFormat})</Link></h3>
           <div className='distribution__license'>{distributionLicense}</div>
          </div>
        </div>
}
