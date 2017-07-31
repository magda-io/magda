// @flow
import CustomIcons from '../UI/CustomIcons';
import DataPreviewer from '../UI/DataPreviewer';
import type {ParsedDistribution} from '../helpers/record';
import React from 'react';
import { Link } from 'react-router';
import './Distribution.css';

export default function renderDistribution(distribution: ParsedDistribution, datasetId: string){
  const linkIconClassName = distribution.linkActive ? 'link' : 'unlink'; // Colour link icon red if link is broken
  const linkIconTitle = distribution.linkActive ? 'Download link working' : 'Download link may be broken';
  return <div className={`white-box distribution media clearfix ${distribution.format} distribution__media-object`} key={distribution.id}>
          <div className='media-left'>
          <CustomIcons name={distribution.format}/>
          </div>
          <div className='media-body'>
           <h3><Link to={`/dataset/${encodeURIComponent(datasetId)}/distribution/${encodeURIComponent(distribution.id)}`}>{distribution.title}({distribution.format})</Link></h3>
           <div className='distribution__license'>{distribution.license}</div>
          </div>
          {
            distribution.linkStatusAvailable && <div className='media-right'>
              <i className={`fa fa-${linkIconClassName} fa-2 fa-rotate-90`} title={linkIconTitle} aria-hidden="true"></i>
            </div>
          }
          {
            <DataPreviewer distribution={distribution}/>
          }

        </div>
}
