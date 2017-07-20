//@flow
import React, { Component } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import  ErrorHandler from '../Components/ErrorHandler';
import {config} from '../config.js';
import ReactDocumentTitle from 'react-document-title';
import { fetchPublisherIfNeeded } from '../actions/publisherActions';
import OverviewBox from '../UI/OverviewBox';
import type { Publisher } from '../helpers/publisher';
import ProgressBar from '../UI/ProgressBar';
import {Link} from 'react-router';

import './PublisherDetails.css';

type Props = {
  fetchPublisherIfNeeded: Function,
  params: {
    publisherId: string
  },
  publisher: Publisher,
  error: number
}


class PublisherDetails extends Component<void, Props, void> {
    componentWillMount(){
        this.props.fetchPublisherIfNeeded(this.props.params.publisherId);
    }

    componentWillReceiveProps(nextProps){
        if(nextProps.params.publisherId !== this.props.params.publisherId){
            nextProps.fetchPublisherIfNeeded(nextProps.params.publisherId);
        }
    }

    renderContent(){
      const publisher= this.props.publisher;
      return <div className='publisher-details container'>
                {this.props.isFetching && <ProgressBar/>}
                <div className='row'>
                    <div className='publisher-details__body col-sm-8'>
                        <h1>{publisher.name}</h1>
                        <div className='publisher-details-overview'>
                            <h3 className='section-heading'>Overview</h3>
                            <OverviewBox content={publisher.description}/>
                        </div>
                    </div>
                    <div className='col-sm-4'>
                        <Link to={`/search?publisher=${encodeURIComponent(publisher.name)}&q=${encodeURIComponent('*')}`}>View all datasets from {publisher.name}</Link>
                    </div>
                </div>
             </div>
    }

    render(){
        if(this.props.error){
            return <ErrorHandler errorCode={this.props.error} />
        }
        return <ReactDocumentTitle title={this.props.publisher.name + ' | ' + config.appName}>{this.renderContent()}</ReactDocumentTitle>;
    }
}


function mapDispatchToProps(dispatch: Dispatch) {
  return bindActionCreators({
    fetchPublisherIfNeeded: fetchPublisherIfNeeded,
  }, dispatch);
}

function mapStateToProps(state: Object, ownProps: Object) {
  const publisher: Object= state.publisher.publisher;
  const isFetching: boolean= state.publisher.isFetchingPublisher;
  const error: number= state.publisher.errorFetchingPublisher;
  const location: Location= ownProps.location;
  return {
    publisher, isFetching, location, error
  };
}



export default connect(mapStateToProps, mapDispatchToProps)(PublisherDetails);
