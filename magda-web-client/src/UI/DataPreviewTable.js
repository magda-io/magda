import React from "react";
import ReactTable from "react-table";
import "./ReactTable.css";
import { Medium, Small } from "./Responsive";

function DataPreviewTable(props) {
    if (!props.data.meta.fields)
        return <div>Data grid preview is not available</div>;
    const columns = props.data.meta.fields
        .filter(f => f.length > 0)
        .map(item => ({
            Header: item,
            accessor: item
        }));
    return (
        <div className="clearfix">
            <div className="vis">
                <Medium>
                    <ReactTable
                        minRows={3}
                        style={{
                            height: "500px"
                        }} /* No vert scroll for 10 rows */
                        data={props.data.data}
                        columns={columns}
                    />
                </Medium>
                <Small>
                    <ReactTable
                        minRows={3}
                        style={{
                            height: "350px"
                        }} /* No vert scroll for 5 rows */
                        data={props.data.data}
                        columns={columns}
                    />
                </Small>
            </div>
        </div>
    );
}

export default DataPreviewTable;
