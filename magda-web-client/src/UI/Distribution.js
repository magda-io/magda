// @flow
import CustomIcons from '../UI/CustomIcons';
import React from 'react';
import { Link } from 'react-router';
import './Distribution.css';

export default function renderDistribution(distributionFormat: string, distributionId: string, distributionTitle: string, distributionLicense: string, datasetId: string, linkStatusAvailable: boolean, linkActive: boolean){
  const linkIconClassName = linkActive ? '' : 'text-danger'; // Colour link icon red if link is broken
  const linkIconTitle = linkActive ? 'Download link working' : 'Download link may be broken';
  return <div className={`distribution media clearfix ${distributionFormat} distribution__media-object`} key={distributionId}>
          <div className='media-left'>
          <CustomIcons name={distributionFormat}/>
          </div>
          <div className='media-body'>
           <h3><Link to={`/dataset/${encodeURIComponent(datasetId)}/distribution/${encodeURIComponent(distributionId)}`}>{distributionTitle}({distributionFormat})</Link></h3>
           <div className='distribution__license'>{distributionLicense}</div>
          </div>
          {
            linkStatusAvailable && <div className='media-right'>
              <i className={`fa fa-link fa-2 fa-rotate-90 ${linkIconClassName}`} title={linkIconTitle} aria-hidden="true"></i>
            </div>
          }

        </div>
}
