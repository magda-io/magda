import React, { Component } from "react";
import ReactTable from "react-table";
import "./ReactTable.scss";
import { config } from "config";
import { Medium, Small } from "./Responsive";
import Spinner from "Components/Common/Spinner";
import AUpageAlert from "pancake/react/page-alerts";
import { DataLoadingResult } from "helpers/CsvDataLoader";

type PropsType = {
    dataLoadingResult: DataLoadingResult | null;
    isLodaing: boolean;
    onChangeTab: (string) => void;
};

export default class DataPreviewTable extends Component<PropsType> {
    constructor(props) {
        super(props);
    }

    removeEmptyRows(data) {
        return data.filter(row =>
            Object.keys(row).some(
                key =>
                    typeof row[key] !== "string" || row[key].trim().length > 0
            )
        );
    }

    render() {
        if (
            this.props.dataLoadingResult &&
            this.props.dataLoadingResult.errors &&
            this.props.dataLoadingResult.errors.length
        ) {
            return (
                <AUpageAlert as="error" className="notification__inner">
                    <h3>Oops</h3>
                    <p>
                        Either there's something wrong with the file or there's
                        an internet connection problem
                    </p>
                </AUpageAlert>
            );
        }
        if (this.props.isLodaing) {
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
            !this.props.dataLoadingResult ||
            !this.props.dataLoadingResult.meta ||
            !this.props.dataLoadingResult.meta.fields
        )
            return <div>Data grid preview is not available</div>;
        const fields = this.props.dataLoadingResult.meta.fields;
        const columns = fields
            .filter(f => f.length > 0)
            .map(item => ({
                Header: item,
                accessor: item
            }));

        const rows = this.removeEmptyRows(
            config.maxTableProcessingRows <
                this.props.dataLoadingResult.data.length
                ? this.props.dataLoadingResult.data.slice(
                      0,
                      config.maxTableProcessingRows
                  )
                : this.props.dataLoadingResult.data
        );

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
