import React, { Component } from 'react';
import DataPreviewChart from '../../UI/DataPreviewChart';
import DataPreviewMap from '../../UI/DataPreviewMap';
import defined from '../../helpers/defined';
import PropTypes from 'prop-types';
import './DatasetPreview.css'

export default class DatasetPreview extends Component {
  getDistributionForChart(distributions){
    if(!distributions || distributions.length === 0){
      return null;
    }
    return distributions.find(d=>defined(d.chartFields));
  }
  render(){
    const distributions = this.props.dataset.distributions;

    return (<div className='dataset-preview container'>
                  <DataPreviewChart distribution={this.getDistributionForChart(distributions)}/>
                  <DataPreviewMap dataset={this.props.dataset}/>
            </div>)
  }
}

DatasetPreview.propTypes = {
  dataset: PropTypes.object
};
