// @flow
import React from 'react';
import Statistics from '../Components/Statistics';
import News from '../Components/News';
import {config} from '../config'
import {connect} from 'react-redux';
import { bindActionCreators } from "redux";
import {fetchFeaturedDatasetsFromRegistry} from "../actions/featuredDatasetsActions";
import DatasetSummary from '../Dataset/DatasetSummary';
import './Home.css';

class Home extends React.Component {
  componentWillMount(){
    this.props.fetchFeaturedDatasets(config.featuredDatasets);
  }
  render() {
    return (
      <div className="container home">
        <div className="row">
          <div className="col-sm-8">
            <h2>Featured datasets</h2>
            <div className="white-box">
              {this.props.datasets.map(d=><DatasetSummary key={d.identifier} dataset={d}/>)}
            </div>
            <h2>News</h2>
            <News />
          </div>
          <div className="col-sm-4">
            <h2>data.gov.au statistics</h2>
            <Statistics/>
          </div>
        </div>
      </div>
    );
  }
}

const mapStateToProps = (state) => {
  const datasets= state.featuredDatasets.records;
  const isFetching= state.featuredDatasets.isFetching;
  const error = state.featuredDatasets.error;
  return {datasets, isFetching, error}
}

const mapDispatchToProps = (dispatch: Dispatch<*>) => {
  return bindActionCreators({
    fetchFeaturedDatasets: fetchFeaturedDatasetsFromRegistry,
  }, dispatch);
}

Home.propTypes = {
  featuredDatasets: React.PropTypes.array,
  isFetchingFeaturedDatasets: React.PropTypes.bool,
  isFetchingFeaturedDatasetsError: React.PropTypes.bool,
  error: React.PropTypes.number
}

export default connect(mapStateToProps, mapDispatchToProps)(Home);
