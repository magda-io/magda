import React, { Component } from 'react';
import MarkdownViewer from '../../UI/MarkdownViewer';
import defined from '../../helpers/defined';
import ToggleList from '../../UI/ToggleList';
import QualityIndicator from '../../UI/QualityIndicator';
import renderDistribution from '../../Components/Distribution';
import './DatasetSummary.css';
import { Link } from 'react-router-dom';
import Button from 'muicss/lib/react/button';
import Divider from 'muicss/lib/react/divider';


export default class DatasetSummary extends Component {
  constructor(props) {
    super(props);
    const self: any = this;
  }

  renderDownloads(){
    return <div className='dataset-downloads'>

           </div>
  }

  render(){
    const dataset = this.props.dataset;
    const publisher = dataset.publisher && dataset.publisher.name;
    return <div className='dataset-summary'>
                    <div className='dataset-summary__title-group'>
                      <h3><Link
                            to={`/dataset/${encodeURIComponent(dataset.identifier)}`}>
                        {dataset.title}
                      </Link></h3>
                      {publisher && <span className='dataset-summary-publisher'>{publisher}</span>}
                  </div>

                <div className='dataset-summary__body'>
                <div className='dataset-summary__dataset-description'>
                  <MarkdownViewer markdown={dataset.description}/>
                </div>
                {defined(dataset.quality) && <span className='dataset-summary-quality'> <QualityIndicator quality={dataset.quality}/></span>}
                </div>
          </div>
  }
}
