import React, { Component } from 'react';
import { connect } from 'react-redux';
import {fetchPreviewData} from '../actions/previewDataActions'
import { bindActionCreators } from 'redux';
import DataPreviewer from '../UI/DataPreviewer';
import ProgressBar from "../UI/ProgressBar";

class DistributionPreview extends Component {

  componentWillMount(){
    this.props.fetchPreviewData([this.props.distribution]);

  }

  componentWillReceiveProps(nextProps){
      if(nextProps.distribution.downloadURL && nextProps.distribution.downloadURL !== this.props.distribution.downloadURL){
        this.props.fetchPreviewData([nextProps.distribution]);
      }
  }

  visualisable(){
    return !this.props.isFetching && !this.props.error && this.props.data;
  }

  render(){
    return (<div className='dataset-preview container'>
                  {this.props.isFetching && <ProgressBar/>}
                  {this.visualisable() && <DataPreviewer data={this.props.data} url= {this.props.url}/>}
                  {(!this.props.isFetching && !this.props.data && !this.props.error) && <div>No preview available</div>}
                  {this.props.error && <div> {this.props.error}</div>}
            </div>)
  }
}

function mapStateToProps(state) {
  const distribution =state.record.distribution;
  const previewData= state.previewData;
  const data = previewData.previewData;
  const isFetching = previewData.isFetching;
  const error = previewData.error;
  const url = previewData.url;
  return {
    data, isFetching, error, distribution, url
  };
}

const  mapDispatchToProps = (dispatch: Dispatch<*>) => {
  return bindActionCreators({
    fetchPreviewData: fetchPreviewData,
  }, dispatch);
}

export default connect(mapStateToProps, mapDispatchToProps)(DistributionPreview);
