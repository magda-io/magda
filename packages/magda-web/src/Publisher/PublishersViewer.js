import React, { Component } from 'react';
import { connect } from "react-redux";
import {config} from '../config.js';
import { bindActionCreators } from "redux";
import { fetchPublishersIfNeeded } from '../actions/publisherActions';
import PublisherSummary from './PublisherSummary';
import Pagination from '../UI/Pagination';
import ErrorHandler from '../Components/ErrorHandler';


import './PublishersViewer.css';
class PublishersViewer extends Component {
    componentWillMount(){
      this.props.fetchPublishersIfNeeded(this.props.location.query.page || 1);
    }
    
    componentWillReceiveProps(nextProps){
    if(this.props.location.query.page !== nextProps.location.query.page){
        nextProps.fetchPublishersIfNeeded(nextProps.location.query.page || 1);
      }
    }

    renderContent(){
      if(this.props.error){
        return <ErrorHandler errorCode={this.props.error}/>
      } else{
        return (<div>
              {this.props.publishers.map(p=>
                <PublisherSummary publisher={p} key={p.id}/>
              )}
              {this.props.hitCount > config.resultsPerPage &&
                <Pagination
                  currentPage={+this.props.location.query.page || 1}
                  maxPage={Math.ceil(this.props.hitCount/config.resultsPerPage)}
                  location={this.props.location}
                />}
              </div>)
      }
    }

    render(){
      return <div className="container publishers-viewer">
              {!this.props.isFetching && this.renderContent()}
             </div>
    }
}

PublishersViewer.propTypes = {publishers: React.PropTypes.array,
                              isFetching: React.PropTypes.bool,
                              error: React.PropTypes.string};


function mapDispatchToProps(dispatch) {
  return bindActionCreators({
    fetchPublishersIfNeeded: fetchPublishersIfNeeded,
  }, dispatch);
}

function mapStateToProps(state, ownProps) {
  const publishers= state.publisher.publishers;
  const isFetching= state.publisher.isFetching;
  const hitCount= state.publisher.hitCount;
  const error = state.publisher.error;
  const location = ownProps.location;
  return {
    publishers, isFetching, hitCount, location, error
  };
}

export default connect(mapStateToProps, mapDispatchToProps)(PublishersViewer);