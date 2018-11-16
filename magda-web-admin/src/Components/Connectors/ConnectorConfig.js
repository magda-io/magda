//@flow
import React, { Component } from "react";
import { connect } from "react-redux";
import { config } from "../../config.js";
import { Link } from "react-router-dom";
import { bindActionCreators } from "redux";
import {
    fetchConnectorConfigIfNeeded,
    updateConnectorStatus,
    fetchDatasetFromConnector
} from "../../actions/connectorsActions";
import MagdaDocumentTitle from "../../Components/Meta/MagdaDocumentTitle";
import ErrorHandler from "../../Components/ErrorHandler";
import ProgressBar from "../../UI/ProgressBar";
import AspectBuilder from "../../UI/AspectBuilder";
import LazyJsonTree from "../../Components/LazyJsonTree";
import Script from "react-load-script";

class ConnectorConfig extends Component {
    constructor(props) {
        super(props);
        this.createTransformer = this.createTransformer.bind(this);
        this.renderAspectSelector = this.renderAspectSelector.bind(this);
        this.onSelectAspect = this.onSelectAspect.bind(this);
        this.state = {
            connectorConfig: null,
            scriptLoaded: false,
            aspect: ["datasetAspectBuilders", ""]
        };
    }

    getJsonTreeComponent() {
        return import("react-json-tree").then(module => module.default);
    }

    componentWillMount() {
        this.props.fetchConnectorConfigIfNeeded(
            this.props.match.params.connectorId
        );
        this.props.fetchDatasetFromConnector(
            this.props.match.params.connectorId,
            this.props.match.params.datasetId
        );
    }

    componentWillReceiveProps(nextProps) {
        if (
            this.props.match.params.connectorId !==
            nextProps.match.params.connectorId
        ) {
            this.props.fetchConnectorConfigIfNeeded(
                nextProps.match.params.connectorId
            );
            this.props.fetchDatasetFromConnector(
                this.props.match.params.connectorId,
                this.props.match.params.datasetId
            );
        }

        if (nextProps.connectorConfig) {
            if (!this.state.connectorConfig) {
                //only set it the first time when it's fecthed
                this.setState({
                    connectorConfig: nextProps.connectorConfig,
                    aspect: [
                        "datasetAspectBuilders",
                        nextProps.connectorConfig.datasetAspectBuilders[0]
                            .aspectDefinition.id
                    ]
                });
            }
        }
    }

    createTransformer(type, index, code) {
        const config = this.state.connectorConfig;
        config[type][index]["builderFunctionString"] = code;
        this.setState({
            connectorConfig: config
        });
    }

    handleScriptLoad() {
        this.setState({ scriptLoaded: true });
    }

    handleScriptError() {}

    render() {
        const url = `${config.adminApiUrl}connectors/${
            this.props.match.params.connectorId
        }/interactive/test-harness.js`;
        return (
            <MagdaDocumentTitle>
                <div>
                    <Script
                        url={url}
                        onError={this.handleScriptError.bind(this)}
                        onLoad={this.handleScriptLoad.bind(this)}
                    />
                    {this.renderBody()}
                </div>
            </MagdaDocumentTitle>
        );
    }

    onSelectAspect(event) {
        this.setState({
            aspect: event.target.value.split(",")
        });
    }

    renderAspectSelector() {
        const connectorConfig = this.props.connectorConfig;
        return (
            <select onChange={this.onSelectAspect}>
                <optgroup label="Dataset Aspect Builders">
                    {connectorConfig.datasetAspectBuilders.map(aspect => (
                        <option
                            key={aspect.aspectDefinition.id}
                            value={[
                                "datasetAspectBuilders",
                                aspect.aspectDefinition.id
                            ]}
                        >
                            {aspect.aspectDefinition.name}
                        </option>
                    ))}
                </optgroup>
                <optgroup label="Distribution Aspect Builders">
                    {connectorConfig.distributionAspectBuilders.map(aspect => (
                        <option
                            key={aspect.aspectDefinition.id}
                            value={[
                                "distributionAspectBuilders",
                                aspect.aspectDefinition.id
                            ]}
                        >
                            {aspect.aspectDefinition.name}
                        </option>
                    ))}
                </optgroup>

                <optgroup label="Organization Aspect Builders">
                    {connectorConfig.organizationAspectBuilders.map(aspect => (
                        <option
                            key={aspect.aspectDefinition.id}
                            value={[
                                "organizationAspectBuilders",
                                aspect.aspectDefinition.id
                            ]}
                        >
                            {aspect.aspectDefinition.name}
                        </option>
                    ))}
                </optgroup>
            </select>
        );
    }

    renderBody() {
        if (this.props.error) {
            return <ErrorHandler errorCode={this.props.error} />;
        } else if (
            this.state.connectorConfig &&
            this.props.dataset &&
            this.state.scriptLoaded
        ) {
            const transformer = window.createTransformer.default(
                this.state.connectorConfig
            );
            const connectorConfig = this.state.connectorConfig;
            const dataset = this.props.dataset;

            const record = {};

            record["datasetAspectBuilders"] = transformer.datasetJsonToRecord(
                dataset
            );
            record[
                "distributionAspectBuilders"
            ] = transformer.distributionJsonToRecord(dataset);
            record[
                "organizationAspectBuilders"
            ] = transformer.organizationJsonToRecord(dataset);
            const datasetJson = JSON.stringify(parseDataset(record));

            const aspectConfigIndex = connectorConfig[
                this.state.aspect[0]
            ].findIndex(
                aspect => aspect.aspectDefinition.id === this.state.aspect[1]
            );
            const aspectConfig =
                connectorConfig[this.state.aspect[0]][aspectConfigIndex];
            return (
                <div className="container">
                    <h1>{connectorConfig.name}</h1>
                    <div className="row">
                        <div className="col-sm-4">
                            <div>
                                Test Dataset ID:{" "}
                                {this.props.match.params.datasetId}
                            </div>
                            <Link
                                to={`/connectors/${
                                    this.props.match.params.connectorId
                                }`}
                            >
                                {" "}
                                Select a different dataset for testing{" "}
                            </Link>
                            <LazyJsonTree
                                data={{ data: dataset }}
                                getComponent={this.getJsonTreeComponent}
                            />
                        </div>
                        <div className="col-sm-8">
                            <label>
                                Select an aspect to config:
                                {this.renderAspectSelector()}
                            </label>
                            <AspectBuilder
                                key={this.state.aspect[1]}
                                getComponent={this.getJsonTreeComponent}
                                datasetJson={datasetJson}
                                aspectConfig={aspectConfig}
                                createTransformer={this.createTransformer.bind(
                                    this,
                                    this.state.aspect[0],
                                    aspectConfigIndex
                                )}
                                result={
                                    record[this.state.aspect[0]]["aspects"][
                                        this.state.aspect[1]
                                    ]
                                }
                            />
                        </div>
                    </div>
                </div>
            );
        }
        return <ProgressBar />;
    }
}

function parseDataset(record) {
    const dcatDatasetString =
        record.datasetAspectBuilders.aspects["dcat-dataset-strings"];
    const organizationDetail =
        record.organizationAspectBuilders.aspects["organization-details"];
    return {
        catalog: "",
        description: dcatDatasetString.description,
        distributions: [],
        identifier: [],
        keywords: dcatDatasetString.keywords,
        landingPage: dcatDatasetString.landingPage,
        languages: dcatDatasetString.languages,
        issued: dcatDatasetString.issued,
        modified: dcatDatasetString.modified,
        publisher: {
            identifier: record.organizationAspectBuilders.id,
            title: organizationDetail.title,
            imageUrl: organizationDetail.imageUrl
        },
        quality: 1,
        source: "",
        spatial: dcatDatasetString.spatial,
        temporal: dcatDatasetString.temporal,
        title: dcatDatasetString.title
    };
}

const mapDispatchToProps = (dispatch: Dispatch<*>) => {
    return bindActionCreators(
        {
            fetchConnectorConfigIfNeeded: fetchConnectorConfigIfNeeded,
            updateConnectorStatus: updateConnectorStatus,
            fetchDatasetFromConnector
        },
        dispatch
    );
};

function mapStateToProps(state, ownProps) {
    const connectorConfig = state.connectors.connectorConfig;
    const isFetching = state.connectors.isFetching;
    const error = state.connectors.error;
    const location = ownProps.location;
    const dataset = state.connectors.dataset;
    return {
        connectorConfig,
        isFetching,
        location,
        error,
        dataset
    };
}

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(ConnectorConfig);
