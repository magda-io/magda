import React from 'react';
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import { fetchRecordFromRegistry } from "../actions/recordActions";
import Tabs from '../UI/Tabs';
import {config} from '../config';

class RecordHandler extends React.Component {
  componentWillMount(){
    const datasetId = this.props.params.datasetId;
    const resourceId = this.props.params.resourceId;
    debugger
    if(!resourceId){
      this.props.fetchRecord(datasetId);
    } else{
      this.props.fetchRecord(resourceId);
    }
  }

  renderByState(record){
    if(this.props.notFound){
      return <h2>Page not found</h2>;
    } else if(this.props.error){
      return <h2>error</h2>;
    }
    return (<div>
            <h1>{record.title}</h1>
            <a>{record.landingPage}</a>
            <div>{record.updatedDate}</div>
            <Tabs list = {config.datasetTabList} baseUrl = {`/dataset/${this.props.params.datasetId}`}/>
            <div>{this.props.children}</div>
            </div>);
  }
  
  render() {
    const dataset = this.props.dataset;
    return (
      <div>
          {this.renderByState(dataset)}
      </div>
    );
  }
}

function mapStateToProps(state) {
  const _dataset= state.dataset;
  const dataset = _dataset.data;
  const isFetching = _dataset.isFetching;
  const error = _dataset.error;
  const notFound = _dataset.notFound;

  return {
    dataset, isFetching, error, notFound
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




