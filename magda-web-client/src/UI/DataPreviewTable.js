import React, { Component } from "react";
import ReactTable from "react-table";
import "./ReactTable.css";
import { config } from "../config";
import { Medium, Small } from "./Responsive";
import Spinner from "../Components/Spinner";

function loadPapa() {
    return import(/* webpackChunkName: "papa" */ "papaparse")
        .then(papa => {
            return papa;
        })
        .catch(error => {
            throw new Error("An error occurred while loading the component");
        });
}

export default class DataPreviewTable extends Component<
    {
        distribution: ParsedDistribution
    },
    {
        error: Error,
        loading: Boolean,
        parsedResults: any
    }
> {
    constructor(props) {
        super(props);
        this.state = {
            error: null,
            loading: true,
            parsedResults: null
        };
    }

    componentDidMount() {
        this.fetchData(this.props.distribution.downloadURL);
    }
    componentDidUpdate(prevProps) {
        if (
            prevProps.distribution.downloadURL !==
            this.props.distribution.downloadURL
        ) {
            this.fetchData(this.props.distribution.downloadURL);
        }
        // this.updateDimensions();
    }

    fetchData(url) {
        this.setState({
            error: null,
            loading: true,
            parsedResults: null
        });
        return loadPapa()
            .then(papa => {
                return new Promise((resolve, reject) => {
                    papa.parse(config.proxyUrl + "_0d/" + url, {
                        download: true,
                        header: true,
                        skipEmptyLines: true,
                        complete: results => {
                            resolve(results);
                        },
                        error: err => {
                            reject(err);
                        }
                    });
                });
            })
            .then(results => {
                this.setState({
                    error: null,
                    loading: false,
                    parsedResults: results
                });
            })
            .catch(err => {
                this.setState({
                    error: err,
                    loading: false,
                    parsedResults: null
                });
            });
    }

    removeEmptyRows(data) {
        let dataForTable = [];
        data.forEach(row => {
            let allFieldsEmpty = true;
            // get values in a row as an arrary
            const rowValues = Object.values(row);
            rowValues.forEach(column => {
                if (column.trim().length > 0) {
                    allFieldsEmpty = false;
                }
            });
            if (!allFieldsEmpty) {
                dataForTable.push(row);
            }
        });
        return dataForTable;
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
            return (
                <div>
                    <Medium>
                        <Spinner width="100%" height="500px" />
                    </Medium>
                    <Small>
                        <Spinner width="100%" height="350px" />
                    </Small>
                </div>
            );
        }
        if (
            !this.state.parsedResults ||
            !this.state.parsedResults.meta ||
            !this.state.parsedResults.meta.fields
        )
            return <div>Data grid preview is not available</div>;
        const fields = this.state.parsedResults.meta.fields;
        const columns = fields.filter(f => f.length > 0).map(item => ({
            Header: item,
            accessor: item
        }));
        const rows = this.removeEmptyRows(this.state.parsedResults.data);
        return (
            <div className="clearfix">
                <div className="vis">
                    <Medium>
                        <ReactTable
                            minRows={0}
                            style={{
                                height: "500px"
                            }} /* No vert scroll for 10 rows */
                            data={rows}
                            columns={columns}
                        />
                    </Medium>
                    <Small>
                        <ReactTable
                            minRows={3}
                            style={{
                                height: "350px"
                            }} /* No vert scroll for 5 rows */
                            data={rows}
                            columns={columns}
                        />
                    </Small>
                </div>
            </div>
        );
    }
}
