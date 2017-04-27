import React from 'react';
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import { fetchRecordFromRegistry } from "../actions/recordActions";
import Tabs from '../UI/Tabs';
import {config} from '../config';
import { Link } from 'react-router';

class RecordHandler extends React.Component {
  componentWillMount(){
    if(!this.props.params.distributionId){
      this.props.fetchRecord(this.props.params.datasetId);
    } else{
      this.props.fetchRecord(this.props.params.distributionId);
    }
  }

  componentWillReceiveProps(nextProps){
    if(!nextProps.params.distributionId){
      if(!this.props.params.distributionId && (nextProps.params.datasetId !== this.props.params.datasetId)){
        nextProps.fetchRecord(nextProps.params.datasetId);
      } else if(this.props.params.distributionId){
        nextProps.fetchRecord(nextProps.params.datasetId);
      }
    } else if(nextProps.params.distributionId !== this.props.params.distributionId){
      nextProps.fetchRecord(nextProps.params.distributionId);
    }
  }

  renderByState(record){
    if(this.props.notFound){
      return <h2>Page not found</h2>;
    } else if(this.props.error){
      return <h2>error</h2>;
    } else if(this.props.params.distributionId){
      return (
        <div>
          <ul className="breadcrumb">
            <li className="breadcrumb-item"><Link to="#">Home</Link></li>
            <li className="breadcrumb-item"><Link to={`/dataset/${this.props.params.datasetId}`}>Dataset</Link></li>
          </ul>
            <h1>{record.title}</h1>
            <a>{record.downloadUrl}</a>
            <div>{record.distributionUpdatedDate}</div>
            <Tabs list = {config.distributionTabList} baseUrl = {`/dataset/${this.props.params.datasetId}/distribution/${this.props.params.distributionId}`}/>
            <div>{this.props.children}</div>
            </div>
      )
    }
    return (
      <div>
            <h1>{record.title}</h1>
            <a>{record.landingPage}</a>
            <div>{record.updatedDate}</div>
            <Tabs list = {config.datasetTabList} baseUrl = {`/dataset/${this.props.params.datasetId}`}/>
            <div>{this.props.children}</div>
            </div>
    );
  }
  
  render() {
    const record = this.props.record;
    return (
      <div>
          {this.renderByState(record)}
      </div>
    );
  }
}

function mapStateToProps(state) {
  const _record=state.record;
  const record=_record.data;
  const isFetching=_record.isFetching;
  const error=_record.error;
  const notFound=_record.notFound;

  return {
    record, isFetching, error, notFound
  };
}

function mapDispatchToProps(dispatch) {
  return bindActionCreators({
    fetchRecord: fetchRecordFromRegistry,
  }, dispatch);
}

RecordHandler.propTypes = {
  data: React.PropTypes.object,
  location: React.PropTypes.object.isRequired,
  isFetching: React.PropTypes.bool.isRequired,
  notFound: React.PropTypes.bool.isRequired,
  error: React.PropTypes.object
}

export default connect(mapStateToProps, mapDispatchToProps)(RecordHandler);




