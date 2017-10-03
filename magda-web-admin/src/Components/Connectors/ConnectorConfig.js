//@flow
import React, { Component } from "react";
import { connect } from "react-redux";
import { config } from "../../config.js";
import { Link } from "react-router";
import { bindActionCreators } from "redux";
import { fetchConnectorConfigIfNeeded, updateConnectorStatus } from '../../actions/connectorsActions';
import ReactDocumentTitle from "react-document-title";
import ErrorHandler from "../../Components/ErrorHandler";
import ProgressBar from "../../UI/ProgressBar";
import LazyComponent from '../../Components/LazyComponent';

class ConnectorConfig extends Component {

  getComponent(){
      return import('react-json-tree').then(module => module.default)
    }


  componentWillMount() {
    this.props.fetchConnectorConfigIfNeeded(this.props.params.connectorId);
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.params.connectorId !== nextProps.params.connectorId) {
      this.props.fetchConnectorConfigIfNeeded(nextProps.params.connectorId);
    }
  }

  render() {
    if (this.props.error) {
      return <ErrorHandler errorCode={this.props.error} />;
    } else if (!this.props.isFetching && this.props.connectorConfig) {
      return (
        <ReactDocumentTitle title={this.props.connectorConfig.name + "|" + config.appName}>
          <div className='container'>
            <h1>{this.props.connectorConfig.name}</h1>
            <LazyComponent data={{data: this.props.connectorConfig}} getComponent={this.getComponent}/>
          </div>
        </ReactDocumentTitle>
      );
    }
    return <ProgressBar />;
  }
}

const mapDispatchToProps = (dispatch: Dispatch<*>)=>{
  return bindActionCreators(
    {
      fetchConnectorConfigIfNeeded: fetchConnectorConfigIfNeeded,
      updateConnectorStatus: updateConnectorStatus
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

  return {
    connectorConfig,
    isFetching,
    location,
    error,
    user
  };
}

export default connect(mapStateToProps, mapDispatchToProps)(ConnectorConfig);
