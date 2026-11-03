import React, { FunctionComponent, useState } from "react";
import IconButton from "rsuite/IconButton";
import Pagination from "rsuite/Pagination";
import { MdArrowDownward, MdArrowUpward } from "react-icons/md";

type MoveButtonsProps = {
    index: number;
    total: number;
    disabled?: boolean;
    onMove: (index: number, direction: -1 | 1) => void;
};

export const MoveButtons: FunctionComponent<MoveButtonsProps> = ({
    index,
    total,
    disabled,
    onMove
}) => (
    <>
        <IconButton
            size="sm"
            appearance="subtle"
            title="Move up"
            aria-label="Move up"
            icon={<MdArrowUpward />}
            disabled={disabled || index <= 0}
            onClick={() => onMove(index, -1)}
        />
        <IconButton
            size="sm"
            appearance="subtle"
            title="Move down"
            aria-label="Move down"
            icon={<MdArrowDownward />}
            disabled={disabled || index >= total - 1}
            onClick={() => onMove(index, 1)}
        />
    </>
);

const DEFAULT_PAGE_SIZE = 10;

/**
 * Client-side pagination of an already loaded list.
 */
export function usePagedRecords<T>(records: T[]) {
    const [page, setPage] = useState<number>(1);
    const [limit, setLimit] = useState<number>(DEFAULT_PAGE_SIZE);
    const total = records.length;
    const maxPage = total ? Math.ceil(total / limit) : 1;
    const activePage = page < 1 ? 1 : page > maxPage ? maxPage : page;
    const offset = (activePage - 1) * limit;
    return {
        offset,
        pageRecords: records.slice(offset, offset + limit),
        pagination: (
            <div className="pagination-container">
                <Pagination
                    prev
                    next
                    first
                    last
                    ellipsis
                    boundaryLinks
                    maxButtons={5}
                    size="xs"
                    layout={["total", "-", "limit", "|", "pager", "skip"]}
                    total={total}
                    limitOptions={[DEFAULT_PAGE_SIZE, 20, 50]}
                    limit={limit}
                    activePage={activePage}
                    onChangePage={setPage}
                    onChangeLimit={(limit) => {
                        setLimit(limit);
                        setPage(1);
                    }}
                />
            </div>
        )
    };
}
