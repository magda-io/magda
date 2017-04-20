import React from 'react';
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import { fetchDatasetFromRegistry } from "../actions/dataset";

class DatasetDetails extends React.Component {
  componentWillMount(){
    const id = this.props.params.datasetId;
    this.props.fetchDataset(id);
  }

  renderByState(){
    let state = 2;
    if(!this.props.notFound && !this.props.error && this.props.dataset){
      state = 0;
    } else if(this.props.error){
      state = 1;
    }
    switch(state){
      case 0: 
      return <h2>Successfully found dataset</h2>;
      case 1: 
      return <h2>error</h2>;
      case 2:
      return <h2>Page not found</h2>;
    }

  }

  render() {
    return (
      <div>
          <h1> Dataset details </h1>
          {this.renderByState()}
      </div>
    );
  }
}

function mapStateToProps(state) {
  const _dataset= state.dataset;
  const dataset = _dataset.dataset;
  const isFetching = _dataset.isFetching;
  const error = _dataset.error;
  const notFound = _dataset.notFound;

  return {
    dataset, isFetching, error, notFound
  };
}

function mapDispatchToProps(dispatch) {
  return bindActionCreators({
    fetchDataset: fetchDatasetFromRegistry,
  }, dispatch);
}

DatasetDetails.propTypes = {
  dataset: React.PropTypes.object,
  location: React.PropTypes.object.isRequired,
  isFetching: React.PropTypes.bool.isRequired,
  notFound: React.PropTypes.bool.isRequired,
  error: React.PropTypes.object
}

export default connect(mapStateToProps, mapDispatchToProps)(DatasetDetails);




