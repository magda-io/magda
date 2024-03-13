import React from "react";
import ReactTable from "./ReactTable";

import { Medium, Small } from "./Responsive";
import Spinner from "Components/Common/Spinner";
import { DataLoadingResult } from "helpers/CsvDataLoader";
import FileTooBigError from "./FileTooBigError";

type PropsType = {
    dataLoadingResult: DataLoadingResult | null;
    dataLoadError: Error | null;
    isLoading: boolean;
};

const DataPreviewTable: React.FC<PropsType> = (props: PropsType) => {
    // --- tell user not all data rows is shown
    function renderPartialDataNotice(rows: any[]) {
        if (!props.dataLoadingResult) return null;
        if (!props.dataLoadingResult.failureReason) return null;
        return <FileTooBigError />;
    }

    if (props.dataLoadError) {
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
    if (props.isLoading) {
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
    const fields = props?.dataLoadingResult?.parseResult?.meta?.fields;
    const columns = fields?.filter((f) => !!f?.length);
    if (!columns?.length) return <div>Data grid preview is not available</div>;

    const rows = props?.dataLoadingResult?.parseResult?.data;
    if (!rows?.length) return <div>Data grid preview is not available</div>;

    return (
        <div className="clearfix">
            <div className="vis">
                <Medium>
                    <ReactTable
                        data={rows}
                        columns={columns}
                        height={420} /* No vert scroll for 5 rows */
                    />
                    {renderPartialDataNotice(rows)}
                </Medium>
                <Small>
                    <ReactTable
                        data={rows}
                        columns={columns}
                        height={300} /* No vert scroll for 5 rows */
                    />
                    {renderPartialDataNotice(rows)}
                </Small>
            </div>
        </div>
    );
};

export default DataPreviewTable;
