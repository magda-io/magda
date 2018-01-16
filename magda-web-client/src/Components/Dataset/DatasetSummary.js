import React, { Component } from 'react';
import MarkdownViewer from '../../UI/MarkdownViewer';
import defined from '../../helpers/defined';
import getDateString from '../../helpers/getDateString';
import ToggleList from '../../UI/ToggleList';
import QualityIndicator from '../../UI/QualityIndicator';
import renderDistribution from '../../Components/Distribution';
import './DatasetSummary.css';
import { Link } from 'react-router-dom';
import Button from 'muicss/lib/react/button';
import Divider from 'muicss/lib/react/divider';
import uniq from 'lodash.uniq';


export default class DatasetSummary extends Component {
  constructor(props) {
    super(props);
    this.renderDownloads = this.renderDownloads.bind(this);
  }

  renderDownloads(dataset){
    const formats = uniq(dataset.distributions.map((dis)=> dis.format));
    return <div className='dataset-summary-downloads'>
              {formats.map((f)=>
              <a key={f}>{f}</a>)}
           </div>
  }

  render(){
    const dataset = this.props.dataset;
    const publisher = dataset.publisher && dataset.publisher.name;
    return <div className='dataset-summary'>
                <h3><Link
                      className='dataset-summary-title'
                      to={`/dataset/${encodeURIComponent(dataset.identifier)}`}>
                  {dataset.title}
                </Link></h3>
                {publisher && <div className='dataset-summary-publisher'>{publisher}</div>}

                <div className='dataset-summary-description'>
                  <MarkdownViewer markdown={dataset.description}/>
                </div>
                <div className='dataset-summary-meta'>
                  {defined(dataset.modified) && <span className='dataset-summary-updated'> Dataset Updated {getDateString(dataset.modified)}</span>}
                  {defined(dataset.quality) && <span className='dataset-summary-quality'> <QualityIndicator quality={dataset.quality}/></span>}
                  {defined(dataset.distributions && dataset.distributions.length > 0) && this.renderDownloads(dataset)}
                </div>

          </div>
  }
}
