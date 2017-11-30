// @flow
import React from 'react';
import { connect } from 'react-redux';
import ProgressBar from '../UI/ProgressBar';
import ReactDocumentTitle from 'react-document-title';
import { bindActionCreators } from 'redux';
import { fetchDatasetFromRegistry, fetchDistributionFromRegistry } from '../actions/recordActions';
import Tabs from '../UI/Tabs';
import {config} from '../config';
import ErrorHandler from './ErrorHandler';
import CustomIcons from '../UI/CustomIcons';
import RouteNotFound from './RouteNotFound';
import type {StateRecord } from '../types';
import type { ParsedDataset, ParsedDistribution } from '../helpers/record';

import getDateString from '../helpers/getDateString';

import { graphql } from 'react-apollo';
import gql from 'graphql-tag';

import {
  Route,
  Link,
  Switch,
  Redirect
} from 'react-router-dom';
import DatasetDetails from './Dataset/DatasetDetails';
import DatasetDiscussion from './Dataset/DatasetDiscussion';
import DatasetPublisher from './Dataset/DatasetPublisher';
import DistributionDetails from './Dataset/DistributionDetails';
import DistributionPreview from './Dataset/DistributionPreview';

class RecordHandler extends React.Component {
  props: {
    distributionFetcherror: object,
    datasetFetcherror: object,
    children: React$Element<any>,
    fetchDataset: Function,
    fetchDistribution: Function,
    dataset: ParsedDataset,
    distribution: ParsedDistribution,
    params: {
      datasetId: string,
      distributionId? : string
    }
  }
  componentWillMount(){
    /*this.props.fetchDataset(this.props.match.params.datasetId);
    if(this.props.match.params.distributionId){
      this.props.fetchDistribution(this.props.match.params.distributionId);
    }*/
  }
  componentWillReceiveProps(nextProps){
      if(nextProps.match.params.datasetId !== this.props.match.params.datasetId){
        nextProps.fetchDataset(nextProps.match.params.datasetId);
      }
      if(nextProps.match.params.distributionId && nextProps.match.params.distributionId !== this.props.match.params.distributionId){
        nextProps.fetchDistribution(nextProps.match.params.distributionId);
      }
  }

  renderBreadCrumbs(dataset: ParsedDataset, distribution? :ParsedDistribution){
    return (
    <ul className='breadcrumb'>
      <li className='breadcrumb-item'><Link to='/'>Home</Link></li>
      <li className='breadcrumb-item'>{distribution ? <Link to={`/dataset/${encodeURIComponent(dataset.identifier)}`}>{dataset.title}</Link>:dataset.title}</li>
      {distribution && <li className='breadcrumb-item'>{distribution.title}</li>}
    </ul>)
  }

  renderByState(){
    const publisherName = this.props.dataset.publisher.name;
    const publisherLogo = (this.props.dataset.publisher && this.props.dataset.publisher['aspects']['organization-details']) ? this.props.dataset.publisher['aspects']['organization-details']['imageUrl'] : '';
    const publisherId = this.props.dataset.publisher ? this.props.dataset.publisher.id : null;
    const distributionIdAsUrl = this.props.match.params.distributionId ? encodeURIComponent(this.props.match.params.distributionId) : '';
    if(this.props.match.params.distributionId){
      if(this.props.distributionIsFetching){
        return <ProgressBar/>
      } else{
        if(this.props.distributionFetchError){
          return <ErrorHandler error={this.props.distributionFetchError}/>;
        }
        const tabList = [
          {id: 'details', name: 'Details', isActive: true},
          {id: 'preview', name: 'Preview', isActive: true}
        ];
        const baseUrlDistribution = `/dataset/${encodeURIComponent(this.props.match.params.datasetId)}/distribution/${distributionIdAsUrl}`
       return (
         <div>
           <div className='container'>
             {this.renderBreadCrumbs(this.props.dataset, this.props.distribution)}
               <div className='media'>
                 <div className='media-left'>
                   <CustomIcons imageUrl={publisherLogo} name={publisherName}/>
                 </div>
                 <div className='media-body'>
                   <h1>{this.props.distribution.title}</h1>
                   <div className='publisher'>{publisherName}</div>
                   <div className='updated-date'>Updated {this.props.distribution.updatedDate}</div>
                 </div>
               </div>
             </div>

             <Tabs list={tabList} baseUrl={baseUrlDistribution}/>
             <div className='tab-content'>
               <Switch>
                 <Route path='/dataset/:datasetId/distribution/:distributionId/details' component={DistributionDetails} />
                 <Route path='/dataset/:datasetId/distribution/:distributionId/preview' component={DistributionPreview} />
                 <Redirect from='/dataset/:datasetId/distribution/:distributionId' to={`${baseUrlDistribution}/details`} />
               </Switch>
             </div>
             </div>
       )
      }
    }

     else if(this.props.match.params.datasetId){
       if(this.props.datasetIsFetching){
         return <ProgressBar/>
       } else{
         if(this.props.datasetFetchError){
           return <ErrorHandler error={this.props.datasetFetchError}/>;
         }
         const datasetTabs = [
           {id: 'details', name: 'Details', isActive: true},
           {id:  'discussion', name: 'Discussion', isActive: !config.disableAuthenticationFeatures},
           {id: 'publisher', name: 'About ' + publisherName, isActive: publisherId},
         ];

         const baseUrlDataset = `/dataset/${encodeURIComponent(this.props.match.params.datasetId)}`;

         return (
           <div>
               <div className='container media'>
                 {this.renderBreadCrumbs(this.props.dataset)}
                 <div className='media-left'>
                   <CustomIcons imageUrl={publisherLogo} name={publisherName}/>
                 </div>
                  <div className='media-body'>
                     <h1>{this.props.dataset.title}</h1>
                     <div className='publisher'>{publisherName}</div>
                     <div className='updated-date'>Updated {this.props.dataset.updatedDate}</div>
                 </div>
               </div>

               <Tabs list={datasetTabs} baseUrl={baseUrlDataset}/>
               <div className='tab-content'>
                 <Switch>
                   <Route path='/dataset/:datasetId/details' render={(props) => <DatasetDetails dataset={this.props.dataset} {...props}/>} />
                   <Route path='/dataset/:datasetId/discussion' component={DatasetDiscussion} />
                   <Route path='/dataset/:datasetId/publisher' component={DatasetPublisher} />
                   <Redirect exact from='/dataset/:datasetId' to={`${baseUrlDataset}/details`} />
                 </Switch>
               </div>
           </div>
         );
       }
    }
    return <RouteNotFound/>
  }

  render() {
    const title = this.props.match.params.distributionId ? this.props.distribution.title : this.props.dataset.title;
    return (
      <ReactDocumentTitle title={title + '|' + config.appName}>
        <div>
            {this.renderByState()}
        </div>
      </ReactDocumentTitle>
    );
  }
}

function mapStateToProps(state: {record: StateRecord}) {
  const record = state.record;
  const dataset =record.dataset;
  const distribution =record.distribution;
  const datasetIsFetching =record.datasetIsFetching;
  const distributionIsFetching = record.distributionIsFetching;
  const datasetFetchError = record.datasetFetchError;
  const distributionFetchError= record.distributionFetchError;

  return {
    /* dataset,*/ distribution, datasetIsFetching, distributionIsFetching, distributionFetchError, datasetFetchError
  };
}

const  mapDispatchToProps = (dispatch: Dispatch<*>) => {
  return bindActionCreators({
    fetchDataset: fetchDatasetFromRegistry,
    fetchDistribution: fetchDistributionFromRegistry
  }, dispatch);
}

const defaultPublisher = {
  id: '',
  name: '',
  aspects:{
    source: {
      url: '',
      type: '',
    },
    organization_details: {
      name: '',
      title: '',
      imageUrl: '',
      description: 'No Description available for this publisher'
    }
  }
}

const defaultDatasetAspects = {
  'dcat_dataset_strings': {
    description: undefined,
    keywords: [],
    landingPage: undefined,
    title: undefined,
    issued: undefined,
    modified: undefined
  },
  'dataset_distributions':{
    distributions: []
  },
  'temporal_coverage': null,
  'dataset_publisher': {publisher: defaultPublisher},
  'source': {
    'url': '',
    'name': '',
    'type': '',
  },
  error: null
}


const defaultDistributionAspect = {
  'dcat_distribution_strings': {
    format: null,
    downloadURL: null,
    accessURL: null,
    updatedDate: null,
    license: null,
    description: null,
  },
  'source_link_status': {
    status: null
  },
  "visualisation_info": {
    "fields": {},
    "format": null,
    "timeseries": false,
    "wellFormed": false
    }
}

function parseDataset(dataset): ParsedDataset {
    let error = null;
    if(dataset && !dataset.id){
      error = dataset.message || 'Error occurred';
    }
    const aspects = dataset ? Object.assign({}, defaultDatasetAspects, dataset.aspects) : defaultDatasetAspects;
    const identifier = dataset ? dataset.id : '';
    const datasetInfo = aspects.dcat_dataset_strings;
    const distribution = aspects.dataset_distributions;
    const temporalCoverage = aspects.temporal_coverage;
    const description = datasetInfo.description || 'No description provided';
    const tags = datasetInfo.keywords || [];
    const landingPage = datasetInfo.landingPage || '';
    const title = datasetInfo.title || '';
    const issuedDate= datasetInfo.issued || 'Unknown issued date';
    const updatedDate = datasetInfo.modified ? getDateString(datasetInfo.modified) : 'unknown date';
    const publisher =aspects.dataset_publisher ? aspects.dataset_publisher.publisher : defaultPublisher;

    const source: string = aspects.source ? aspects.source.name : defaultDatasetAspects.source.name;

    const distributions = distribution.distributions.map(d=> {
        const distributionAspects = Object.assign({}, defaultDistributionAspect, d.aspects);
        const info = distributionAspects.dcat_distribution_strings;
        const linkStatus = distributionAspects.source_link_status;
        const visualisationInfo = distributionAspects.visualisation_info;
        return {
            identifier: d.id,
            title: d.name,
            downloadURL: info.downloadURL || null,
            accessURL : info.accessURL || null,
            format: info.format || 'Unknown format',
            license: (!info.license || info.license === 'notspecified') ? 'License restrictions unknown' : info.license,
            description: info.description || 'No description provided',
            linkStatusAvailable: Boolean(linkStatus.status), // Link status is available if status is non_empty string
            linkActive: linkStatus.status === 'active',
            updatedDate: info.modified ? getDateString(info.modified) : 'unknown date',
            isTimeSeries: visualisationInfo['timeseries']
        }
    });
    console.log({
      identifier, title, issuedDate, updatedDate, landingPage, tags, description, distributions, source, temporalCoverage, publisher, error
    });
    return {
        identifier, title, issuedDate, updatedDate, landingPage, tags, description, distributions, source, temporalCoverage, publisher, error
    }
  };

const DATASET_QUERY = gql`
  query DatasetQuery($id: ID!) {
    dataset: record(id: $id) {
      id
      name
      aspects {
        dcat_dataset_strings {
          description

          landingPage
          title
          issued
          modified
        }
        dataset_distributions {
          distributions {
            id
            name
            aspects {
              dcat_distribution_strings {
                downloadURL
                accessURL
                format
                license
                description
                modified
              }
            }
          }
        }
      }
    }
  }
`;
export default graphql(DATASET_QUERY, {
  options: (props) => ({
    variables: {
      id: props.match.params.datasetId
    }
  }),
  props: ({ data }) => ({
    dataset: parseDataset(data.dataset)
  })
})(connect(mapStateToProps, mapDispatchToProps)(RecordHandler));
