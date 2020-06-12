import React, { Component } from "react";
import { config, getProxiedResourceUrl } from "config";
import fetch from "isomorphic-fetch";
import Spinner from "./Spinner";

import { ParsedDistribution } from "helpers/record";

function importReactJsonTree() {
    return import("react-json-tree").then((module) => module.default);
}

class DataPreviewJson extends Component<
    {
        distribution: ParsedDistribution;
    },
    any
> {
    constructor(props) {
        super(props);
        this.state = {
            error: null,
            loading: true,
            json: null,
            reactJsonTree: null
        };
    }
    componentDidUpdate(prevProps) {
        if (
            prevProps.distribution.downloadURL !==
            this.props.distribution.downloadURL
        ) {
            this.fetchData(this.props.distribution.downloadURL);
        }
    }

    componentDidMount() {
        this.fetchData(this.props.distribution.downloadURL);
        importReactJsonTree().then((reactJsonTree) => {
            this.setState({
                reactJsonTree
            });
        });
    }
    fetchData(url) {
        this.setState({
            error: null,
            loading: true,
            json: null
        });
        return fetch(getProxiedResourceUrl(url), config.credentialsFetchOptions)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(
                        `${response.status} (${response.statusText})`
                    );
                } else {
                    return response.json();
                }
            })
            .then((json) => {
                this.setState({
                    error: null,
                    loading: false,
                    json
                });
            })
            .catch((err) => {
                console.warn(err);
                this.setState({
                    error: err,
                    loading: false,
                    json: null
                });
            });
    }

    render() {
        if (this.state.error) {
            return (
                <div className="error">
                    <h3>{this.state.error.name}</h3>
                    {this.state.error.message}
                </div>
            );
        }
        const ReactJsonTree = this.state.reactJsonTree;
        if (this.state.loading || !ReactJsonTree) {
            return <Spinner height="420px" width="420px" />;
        }
        return (
            <div className="data-preview-json">
                <ReactJsonTree data={this.state.json} />
            </div>
        );
    }
}

export default DataPreviewJson;
