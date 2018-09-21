import React, { Component } from "react";
import { config } from "../config";
import fetch from "isomorphic-fetch";
import Spinner from "../Components/Spinner";
import "./DataPreviewTextBox.css";

class DataPreviewTextBox extends Component<{
    distribution: ParsedDistribution
}> {
    constructor(props) {
        super(props);
        this.state = {
            error: null,
            loading: true,
            text: null
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
    }

    fetchData(url) {
        this.setState({
            error: null,
            loading: true,
            text: null
        });
        return fetch(config.proxyUrl + url, config.fetchOptions)
            .then(response => {
                if (!response.ok) {
                    throw new Error(
                        `${response.status} (${response.statusText})`
                    );
                } else {
                    return response.text();
                }
            })
            .then(text => {
                this.setState({
                    error: null,
                    loading: false,
                    text
                });
            })
            .catch(err => {
                console.warn(err);
                this.setState({
                    error: err,
                    loading: false,
                    text: null
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
        if (this.state.loading) {
            return <Spinner height="420px" />;
        }
        return (
            <div className="data-preview-text-box">
                <pre>{this.state.text}</pre>
            </div>
        );
    }
}

export default DataPreviewTextBox;
