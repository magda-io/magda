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
import Script from 'react-load-script'

class ConnectorConfig extends Component {
  constructor(props) {
    super(props);
    this.createTransformer = this.createTransformer.bind(this);
    this.state ={
      testDatasetId: 'a0f2aa22-512d-4c08-9b7d-bb8a51163f4c',
      connectorConfig: null,
      scriptLoaded: false
    }
  }



  componentWillMount() {
    this.props.fetchConnectorConfigIfNeeded(this.props.params.connectorId);
    this.props.fetchDatasetFromConnector(this.props.params.connectorId, this.state.testDatasetId);
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.params.connectorId !== nextProps.params.connectorId) {
      this.props.fetchConnectorConfigIfNeeded(nextProps.params.connectorId);
      this.props.fetchDatasetFromConnector(this.props.params.connectorId, this.state.testDatasetId);
    }

    if(nextProps.connectorConfig){
      this.setState({
        connectorConfig: nextProps.connectorConfig
      })
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
    debugger
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

  renderBody() {
    if (this.props.error) {
      return <ErrorHandler errorCode={this.props.error} />;
    } else if (!this.props.isFetching && this.state.connectorConfig && this.props.dataset && this.state.scriptLoaded) {
      const transformer = window.createTransformer.default(this.state.connectorConfig);
      const connectorConfig = this.state.connectorConfig;
      const dataset = this.props.dataset;
      const record = transformer.datasetJsonToRecord(dataset);
      console.log(record);

      return (
        <div className='container'>
          <h1>{connectorConfig.name}</h1>
          <div>Test Dataset: {this.state.testDatasetId}</div>
          <div><h2>Dataset aspect builders</h2>{connectorConfig.datasetAspectBuilders.map((aspect, index) => <AspectBuilder key={aspect.aspectDefinition.id} data={aspect} createTransformer={this.createTransformer.bind(this,'datasetAspectBuilders', index)} result={record['aspects'][aspect.aspectDefinition.id]}/>)}</div>
          <div><h2>Distribution aspect builders</h2></div>
          <div><h2>Organization aspect builders</h2></div>
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
