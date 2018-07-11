import React from "react";
import { config } from "../../config.js";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import ReactDocumentTitle from "react-document-title";
import { fetchDatasetSearchResultsIfNeeded } from "../../actions/connectorsActions";
import debounce from "lodash.debounce";
import { Link } from "react-router-dom";
import "./SelectDataset.css";

class SelectDataset extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            testDatasetId: "a0f2aa22-512d-4c08-9b7d-bb8a51163f4c",
            testDatasetUrl: "",
            testDatasetSearchText: ""
        };
        this.onChange = this.onChange.bind(this);
        this.handleSearchFieldEnterKeyPress = this.handleSearchFieldEnterKeyPress.bind(
            this
        );
    }

    debounceUpdateSearchQuery = debounce(
        this.props.fetchDatasetSearchResultsIfNeeded,
        3000
    );

    onChange(key, event) {
        this.setState({
            [key]: event.target.value
        });
        this.debounceUpdateSearchQuery(
            this.props.match.params.connectorId,
            event.target.value
        );
    }

    handleSearchFieldEnterKeyPress(event) {
        // when user hit enter, no need to submit the form
        if (event.charCode === 13) {
            event.preventDefault();
            this.debounceUpdateSearchQuery.flush();
        }
    }

    renderSearchResults(results) {
        return (
            <ul className="list-unstyled">
                {results.map(r => (
                    <li key={r.id}>
                        <Link
                            to={`/connectors/${
                                this.props.match.params.connectorId
                            }/${r.id}`}
                        >
                            {r.title}
                        </Link>
                    </li>
                ))}
            </ul>
        );
    }

    render() {
        return (
            <ReactDocumentTitle title={"select dataset" + config.appName}>
                <div className="container selectDataset">
                    <div className="col-sm-8">
                        <h3>
                            Select a {this.props.match.params.connectorId}{" "}
                            dataset to use to test the connecor:
                        </h3>
                        <div>
                            Dataset ID{" "}
                            <input
                                type="text"
                                className="form-control"
                                onChange={this.onChange.bind(
                                    this,
                                    "testDatasetId"
                                )}
                                value={this.state.testDatasetId}
                            />
                        </div>
                        <div>
                            Dataset URL{" "}
                            <input
                                type="text"
                                className="form-control"
                                onChange={this.onChange.bind(
                                    this,
                                    "testDatasetUrl"
                                )}
                                value={this.state.testDatasetUrl}
                            />
                        </div>
                        <div>
                            Search by title{" "}
                            <input
                                type="text"
                                className="form-control"
                                onChange={this.onChange.bind(
                                    this,
                                    "testDatasetSearchText"
                                )}
                                onKeyPress={this.handleSearchFieldEnterKeyPress}
                                value={this.state.testDatasetSearchText}
                            />
                        </div>
                        {this.state.testDatasetSearchText.length > 0 &&
                            this.renderSearchResults(
                                this.props.datasetSearchResults
                            )}
                        <Link
                            className="btn btn-primary"
                            disabled={!this.state.testDatasetId}
                            to={`${this.props.match.params.connectorId}/${
                                this.state.testDatasetId
                            }`}
                        >
                            Go
                        </Link>
                    </div>
                </div>
            </ReactDocumentTitle>
        );
    }
}

function mapStateToProps(state) {
    let { connectors: { datasetSearchResults, isFetching, error } } = state;

    return {
        datasetSearchResults,
        isFetching,
        error
    };
}

const mapDispatchToProps = (dispatch: Dispatch<*>) => {
    return bindActionCreators({ fetchDatasetSearchResultsIfNeeded }, dispatch);
};

export default connect(mapStateToProps, mapDispatchToProps)(SelectDataset);
