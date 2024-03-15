import React, { useState } from "react";
import Table from "rsuite/Table";
import "../../rsuite.scss";
import "./ReactTable.scss";
import { useAsync } from "react-async-hook";

type PropsType = {
    data: {
        [key: string]: any;
    }[];
    columns: string[];
    height?: number;
    // default to true
    compact?: boolean;
};

const CompactCell = (props) => <Table.Cell {...props} style={{ padding: 4 }} />;
const CompactHeaderCell = (props) => (
    <Table.HeaderCell
        {...props}
        style={{
            padding: 4
        }}
    />
);

const NormalCell = (props) => <Table.Cell {...props} />;
const NormalHeaderCell = (props) => <Table.HeaderCell {...props} />;

const DEFAULT_PAGE_SIZE = 20;

const ReactTable: React.FC<PropsType> = (props) => {
    const { data, columns, height } = props;
    const compact = props.compact === false ? false : true;
    const [limit, setLimit] = useState<number>(DEFAULT_PAGE_SIZE);
    const [page, setPage] = useState<number>(1);

    const CustomCell = compact ? CompactCell : NormalCell;
    const CustomHeaderCell = compact ? CompactHeaderCell : NormalHeaderCell;

    const handleChangeLimit = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLimit = parseInt(e.target.value);
        if (isNaN(newLimit)) return;
        setPage(1);
        setLimit(newLimit);
    };

    const onPageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newPage = parseInt(e.target.value.trim());
        if (isNaN(newPage) || newPage > maxPages || newPage < 1) return;
        setPage(newPage);
    };

    const nextPage = () =>
        setPage((page) => (page < maxPages ? page + 1 : page));
    const prevPage = () => setPage((page) => (page > 1 ? page - 1 : page));

    const { result } = useAsync(async () => {
        if (!data?.length) {
            return [];
        }
        const start = limit * (page - 1);
        const end = start + limit;
        return data.slice(start, end);
    }, [data, limit, page]);

    if (!result?.length || !columns?.length) {
        return null;
    }
    const maxPages = Math.ceil(data.length / limit);

    return (
        <div className="ReactTable">
            <Table
                height={height ? height : 400}
                data={result}
                bordered={true}
                cellBordered={true}
                headerHeight={compact ? 31 : 40}
                rowHeight={compact ? 38 : 46}
            >
                {columns.map((column, index) => (
                    <Table.Column key={index} width={100} resizable fullText>
                        <CustomHeaderCell>{column}</CustomHeaderCell>
                        <CustomCell dataKey={column} />
                    </Table.Column>
                ))}
            </Table>
            <div className="pagination-bottom">
                <div className="-pagination">
                    <div className="-previous">
                        <button
                            type="button"
                            className="-btn"
                            disabled={page <= 1 ? true : false}
                            onClick={prevPage}
                        >
                            Previous
                        </button>
                    </div>
                    <div className="-center">
                        <span className="-pageInfo">
                            Page{" "}
                            <div className="-pageJump">
                                <input
                                    aria-label="jump to page"
                                    type="number"
                                    min={1}
                                    max={maxPages}
                                    value={page}
                                    onChange={onPageInputChange}
                                />
                            </div>{" "}
                            of <span className="-totalPages">{maxPages}</span>
                        </span>
                        <span className="select-wrap -pageSizeOptions">
                            <select
                                aria-label="rows per page"
                                value={limit}
                                onChange={handleChangeLimit}
                            >
                                <option value="5">5 rows</option>
                                <option value="10">10 rows</option>
                                <option value="20">20 rows</option>
                                <option value="25">25 rows</option>
                                <option value="50">50 rows</option>
                                <option value="100">100 rows</option>
                            </select>
                        </span>
                    </div>
                    <div className="-next">
                        <button
                            type="button"
                            className="-btn"
                            disabled={page >= maxPages ? true : false}
                            onClick={nextPage}
                        >
                            Next
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReactTable;
