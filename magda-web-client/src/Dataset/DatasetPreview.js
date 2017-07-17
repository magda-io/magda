import React, { Component } from 'react';
import { connect } from 'react-redux';
import fetch from 'isomorphic-fetch'
import {fetchPreviewData} from '../actions/previewDataActions'
import { bindActionCreators } from 'redux';
import DataPreviewer from '../UI/DataPreviewer';
import ProgressBar from "../UI/ProgressBar";

import JsonForm from 'react-json';

import './DatasetPreview.css'

class DatasetPreview extends Component {
  componentWillMount(){
    this.props.fetchPreviewData(this.props.dataset.distributions);
  }

  componentWillReceiveProps(nextProps){
      if(nextProps.dataset.identifier !== this.props.dataset.identifier){
        this.props.fetchPreviewData(nextProps.dataset.distributions);
      }
  }


  visualisable(){
    return !this.props.isFetching && !this.props.error && this.props.data;
  }

  render(){
    return (<div className='dataset-preview container'>
                  {this.props.isFetching && <ProgressBar/>}
                  {this.visualisable() && <DataPreviewer data={this.props.data} fileName= {this.props.fileName}/>}
                  {(!this.props.isFetching && !this.props.data) && <div>No preview available</div>}
                  {this.visualisable() && this.props.error && <div> Error</div>}
            </div>)
  }
}

function mapStateToProps(state) {
  const dataset = state.record.dataset;
  const previewData= state.previewData;
  const data = previewData.previewData;
  const isFetching = previewData.isFetching;
  const error = previewData.error;
  const fileName = previewData.fileName;
  return {
    data, isFetching, error, dataset, fileName
  };
}

const  mapDispatchToProps = (dispatch: Dispatch<*>) => {
  return bindActionCreators({
    fetchPreviewData: fetchPreviewData,
  }, dispatch);
}

export default connect(mapStateToProps, mapDispatchToProps)(DatasetPreview);
