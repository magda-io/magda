import React, { Component } from "react";
import ReactTable from "react-table";
import "./ReactTable.scss";
import { Medium, Small } from "./Responsive";
import Spinner from "Components/Common/Spinner";
import { DataLoadingResult } from "helpers/CsvDataLoader";
import FileTooBigError from "./FileTooBigError";

type PropsType = {
    dataLoadingResult: DataLoadingResult | null;
    dataLoadError: Error | null;
    isLoading: boolean;
};

export default class DataPreviewTable extends Component<PropsType> {
    removeEmptyRows(data) {
        return data.filter((row) =>
            Object.keys(row).some(
                (key) =>
                    typeof row[key] !== "string" || row[key].trim().length > 0
            )
        );
    }

    // --- tell user not all data rows is shown
    renderPartialDataNotice(rows: any[]) {
        if (!this.props.dataLoadingResult) return null;
        if (!this.props.dataLoadingResult.failureReason) return null;
        return <FileTooBigError />;
    }

    render() {
        if (this.props.dataLoadError) {
            return (
                <div
                    className={`au-page-alerts au-page-alerts--error notification__inner`}
                >
                    <h3>Oops</h3>
                    <p>
                        The requested data source might not be available at this
                        moment.
                    </p>
                </div>
            );
        }
        if (this.props.isLoading) {
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
            !this.props.dataLoadingResult.parseResult ||
            !this.props.dataLoadingResult.parseResult.meta ||
            !this.props.dataLoadingResult.parseResult.meta.fields
        )
            return <div>Data grid preview is not available</div>;
        const fields = this.props.dataLoadingResult.parseResult!.meta.fields;
        const columns = fields
            .filter((f) => f.length > 0)
            .map((item) => ({
                Header: item,
                accessor: item
            }));

        const rows = this.props.dataLoadingResult.parseResult!.data;

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
                        {this.renderPartialDataNotice(rows)}
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
                        {this.renderPartialDataNotice(rows)}
                    </Small>
                </div>
            </div>
        );
    }
}
