//@flow
import React, { Component } from "react";
import { connect } from "react-redux";
import { config } from "../../config.js";
import { Link } from "react-router";
import { bindActionCreators } from "redux";
import { fetchConnectorConfigIfNeeded, updateConnectorStatus, fetchDatasetFromConnector } from '../../actions/connectorsActions';
import ReactDocumentTitle from "react-document-title";
import ErrorHandler from "../../Components/ErrorHandler";
import ProgressBar from "../../UI/ProgressBar";
import AspectBuilder from "../../UI/AspectBuilder";
import LazyJsonTree from "../../Components/LazyJsonTree";
import Script from 'react-load-script'

class ConnectorConfig extends Component {
  constructor(props) {
    super(props);
    this.createTransformer = this.createTransformer.bind(this);
    this.renderAspectSelector = this.renderAspectSelector.bind(this);
    this.onSelectAspect = this.onSelectAspect.bind(this);
    this.state ={
      connectorConfig: null,
      scriptLoaded: false,
      aspect: ['datasetAspectBuilders','dcat-dataset-strings'],
    }
  }

  getJsonTreeComponent(){
      return import('react-json-tree').then(module => module.default)
  }


  componentWillMount() {
    this.props.fetchConnectorConfigIfNeeded(this.props.params.connectorId);
    this.props.fetchDatasetFromConnector(this.props.params.connectorId, this.props.params.datasetId);
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.params.connectorId !== nextProps.params.connectorId) {
      this.props.fetchConnectorConfigIfNeeded(nextProps.params.connectorId);
      this.props.fetchDatasetFromConnector(this.props.params.connectorId, this.props.params.datasetId);
    }

    if(nextProps.connectorConfig){
      if(!this.props.config){
        //only set it the first time when it's fecthed
        this.setState({
          connectorConfig: nextProps.connectorConfig
        })
      }
    }
  }

  createTransformer(type, index, code){
    const config = this.state.connectorConfig;
    config[type][index]['builderFunctionString'] = code;
    this.setState({
      connectorConfig: config
    })
  }

  handleScriptLoad(){
    this.setState({scriptLoaded: true})
  }

  handleScriptError(){
  }

  render(){
    const url = `${config.adminApiUrl}connectors/${this.props.params.connectorId}/interactive/test-harness.js`;
    return (
      <ReactDocumentTitle title={config.appName}>
      <div>
        <Script url={url}
           onError={this.handleScriptError.bind(this)}
           onLoad={this.handleScriptLoad.bind(this)}
         />
       {this.renderBody()}
     </div>
    </ReactDocumentTitle>)
  }


  onSelectAspect(event){
      this.setState({
        aspect: event.target.value.split(',')
      });
  }

  renderAspectSelector(){
    return (<select onChange={this.onSelectAspect}>
                <optgroup label="Dataset Aspect Builders">
                  <option value={['datasetAspectBuilders','ckan-dataset']}>Ckan Dataset</option>
                  <option value={['datasetAspectBuilders','dcat-dataset-strings']}>DCAT Dataset properties as strings</option>
                  <option value={['datasetAspectBuilders','source']}>Source</option>
                </optgroup>
                <optgroup label="Distribution Aspect Builders">
                  <option value={["distributionAspectBuilders", "ckan-resource"]}>CKAN Resource</option>
                  <option value={["distributionAspectBuilders", "dcat-distribution-strings"]}>DCAT Distribution properties as strings</option>
                  <option value={["distributionAspectBuilders", "source"]}>Source</option>
                </optgroup>

                <optgroup label="Organization Aspect Builders">
                  <option value={["organizationAspectBuilders", "source"]}>Source</option>
                  <option value={["organizationAspectBuilders", "organization-details"]}>Organization</option>
                </optgroup>

              </select>);
  }

  renderBody() {
    if (this.props.error) {
      return <ErrorHandler errorCode={this.props.error} />;
    } else if (!this.props.isFetching && this.state.connectorConfig && this.props.dataset && this.state.scriptLoaded) {
      const transformer = window.createTransformer.default(this.state.connectorConfig);
      const connectorConfig = this.state.connectorConfig;
      const dataset = this.props.dataset;
      const record = transformer.datasetJsonToRecord(dataset);
      const aspectConfigIndex = connectorConfig[this.state.aspect[0]].findIndex(aspect =>aspect.aspectDefinition.id === this.state.aspect[1]);
      const aspectConfig = connectorConfig[this.state.aspect[0]][aspectConfigIndex];
      return (
        <div className='container'>
          <h1>{connectorConfig.name}</h1>
          <div className='row'>
          <div className='col-sm-4'>
            <div>Test Dataset ID: {this.props.params.datasetId}</div>
            <Link to={`/connectors/${this.props.params.connectorId}`}> Select a different dataset for testing </Link>
            <LazyJsonTree data={{dataset}} getComponent={this.getJsonTreeComponent}/>
          </div>
          <div className='col-sm-8'>
          <label>
          Select an aspect to config:
          {this.renderAspectSelector()}
          </label>
          <AspectBuilder key={this.state.aspect[1]} getComponent={this.getJsonTreeComponent} aspectConfig={aspectConfig} createTransformer={this.createTransformer.bind(this,this.state.aspect[0], aspectConfigIndex)} result={record['aspects'][this.state.aspect[1]]}/>
          </div>
          </div>
        </div>
      );
    }
    return <ProgressBar />;
  }
}

const mapDispatchToProps = (dispatch: Dispatch<*>)=>{
  return bindActionCreators(
    {
      fetchConnectorConfigIfNeeded: fetchConnectorConfigIfNeeded,
      updateConnectorStatus: updateConnectorStatus,
      fetchDatasetFromConnector
    },
    dispatch
  );
}

function mapStateToProps(state, ownProps) {
  const connectorConfig = state.connectors.connectorConfig;
  const isFetching = state.connectors.isFetching;
  const error = state.connectors.error;
  const location = ownProps.location;
  const user = state.userManagement.user;
  const dataset = state.connectors.dataset;
  return {
    connectorConfig,
    isFetching,
    location,
    error,
    user,
    dataset
  };
}

export default connect(mapStateToProps, mapDispatchToProps)(ConnectorConfig);
