import React, { Component } from 'react';
import DataPreviewVega from '../../UI/DataPreviewVega';
import DataPreviewMap from '../../UI/DataPreviewMap';
import PropTypes from 'prop-types';
import './DatasetPreview.css'

export default class DatasetPreview extends Component {
  render(){
    return (<div className='dataset-preview container'>
                  <DataPreviewVega dataset={this.props.dataset}/>
                  <DataPreviewMap dataset={this.props.dataset}/>
            </div>)
  }
}

DatasetPreview.propTypes = {
  dataset: PropTypes.object
};
