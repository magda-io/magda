import React, { Component } from 'react';
import defined from '../helpers/defined';
import MarkdownViewer from '../UI/MarkdownViewer';
import Star from '../UI/Star';
import { Link } from 'react-router';

export default class DatasetDetails extends Component {
  
  render(){
    let dataset = this.props.dataset;
    return <div className="dataset-details">
                <div className='dataset-details__body'>
                  <div className='dataset-details-overview'>
                    {dataset.description && <MarkdownViewer markdown={dataset.description} stripped={true}/>}
                  </div>
              </div>
          </div>
  }
}

DatasetDetails.propTypes = {dataset: React.PropTypes.object};
