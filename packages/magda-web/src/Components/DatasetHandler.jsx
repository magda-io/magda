import React from 'react';
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import { fetchDatasetFromRegistry } from "../actions/datasetActions";
import DatasetDetails from '../Dataset/DatasetDetails';
import {parseDataset} from '../helpers/dataset';
class DatasetHandler extends React.Component {
  componentWillMount(){
    const id = this.props.params.datasetId;
    this.props.fetchDataset(id);
  }

  renderByState(dataset){
    let state = 2;
    if(!this.props.notFound && !this.props.error && this.props.data){
      state = 0;
    } else if(this.props.error){
      state = 1;
    }
    switch(state){
      case 0: 
      return <h2>{dataset.title}</h2>;
      case 1: 
      return <h2>error</h2>;
      case 2:
      return <h2>Page not found</h2>;
    }

  }
  
  render() {
    const dataset = this.props.data && parseDataset(this.props.data);
    return (
      <div>
          {this.renderByState(dataset)}
          <DatasetDetails dataset={dataset}/>
      </div>
    );
  }
}

function mapStateToProps(state) {
  const dataset= state.dataset;
  const data = dataset.data;
  const isFetching = dataset.isFetching;
  const error = dataset.error;
  const notFound = dataset.notFound;

  return {
    data, isFetching, error, notFound
  };
}

function mapDispatchToProps(dispatch) {
  return bindActionCreators({
    fetchDataset: fetchDatasetFromRegistry,
  }, dispatch);
}

DatasetHandler.propTypes = {
  data: React.PropTypes.object,
  location: React.PropTypes.object.isRequired,
  isFetching: React.PropTypes.bool.isRequired,
  notFound: React.PropTypes.bool.isRequired,
  error: React.PropTypes.object
}

export default connect(mapStateToProps, mapDispatchToProps)(DatasetHandler);




