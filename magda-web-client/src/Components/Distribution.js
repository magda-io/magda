import CustomIcons from '../UI/CustomIcons';
import DataPreviewer from '../Components/DataPreviewer';
import type {ParsedDistribution} from '../helpers/record';
import React from 'react';
import { Link } from 'react-router-dom';
import './Distribution.css';

export default function renderDistribution(distribution: ParsedDistribution, datasetId: string, preview: boolean){
  const linkIconClassName = distribution.linkActive ? 'link' : 'unlink'; // Colour link icon red if link is broken
  const linkIconTitle = distribution.linkActive ? 'Download link working' : 'Download link may be broken';
  return <div className={`white-box distribution media clearfix ${distribution.format}`} key={distribution.identifier}>
          <div className='media-body'>
           <h3><Link to={`/dataset/${encodeURIComponent(datasetId)}/distribution/${encodeURIComponent(distribution.identifier)}`}>{distribution.title}({distribution.format})</Link>{distribution.linkStatusAvailable && <i className={`fa fa-${linkIconClassName} fa-2 fa-rotate-90`} title={linkIconTitle} aria-hidden="true"></i>}</h3>
           <div className='distribution__license'>
           {distribution.license && (typeof distribution.license === 'string' ? distribution.license : (distribution.license.name ?  distribution.license.name : ''))}
           </div>
          </div>
        {preview && <DataPreviewer distribution={distribution}/>}
        </div>
}
