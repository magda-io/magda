import React, { FunctionComponent, useRef } from "react";
import { useAsync } from "react-async-hook";
import { Link, useLocation } from "react-router-dom";
import Table from "rsuite/Table";
import Button from "rsuite/Button";
import IconButton from "rsuite/IconButton";
import {
    MdAddCircle,
    MdBorderColor,
    MdDeleteForever,
    MdList
} from "react-icons/md";
import {
    ContentRecord,
    FooterCategoryItem,
    queryContent
} from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import { getUrlWithPopUpQueryString } from "helpers/popupUtils";
import ConfirmDialog from "../ConfirmDialog";
import useOrderedContentList from "./useOrderedContentList";
import { MoveButtons, usePagedRecords } from "./ContentGridParts";
import { getLastIdSegment } from "./contentUtils";
import FooterCategoryFormPopUp, {
    RefType as FooterCategoryFormPopUpRefType
} from "./FooterCategoryFormPopUp";
import {
    FooterSize,
    footerCategoryIdPrefix,
    footerCategoryLinksIdPrefix,
    footerCategoryLinksPageUrl
} from "./footerUtils";

const { Column, HeaderCell, Cell } = Table;

type RowType = ContentRecord<FooterCategoryItem>;

type PropsType = {
    size: FooterSize;
};

const FooterCategoriesGrid: FunctionComponent<PropsType> = ({ size }) => {
    const location = useLocation();
    const formRef = useRef<FooterCategoryFormPopUpRefType>(null);
    const {
        records,
        loading,
        move,
        remove,
        onChanged,
        nextOrder
    } = useOrderedContentList<FooterCategoryItem>(
        `${footerCategoryIdPrefix(size)}*`
    );
    const { pageRecords, pagination } = usePagedRecords(records);

    // number of links in each category
    const { result: linkCounts } = useAsync(
        async (size: FooterSize, records: RowType[]) => {
            const links = await queryContent(
                `footer/navigation/${size}/category-links/*`
            );
            const counts: Record<string, number> = {};
            links.forEach((link) => {
                const categoryKey = link.id.split("/")[4];
                counts[categoryKey] = (counts[categoryKey] || 0) + 1;
            });
            return counts;
        },
        [size, records]
    );

    const openForm = (id?: string) =>
        formRef.current?.open(id, { nextOrder, onComplete: onChanged });

    const deleteHandler = async (record: RowType) => {
        const label = record?.content?.label;
        try {
            const links = await queryContent(
                `${footerCategoryLinksIdPrefix(
                    size,
                    getLastIdSegment(record.id)
                )}*`
            );
            if (links.length) {
                reportError(
                    `The category "${label}" still has ${links.length} link(s). Please delete its links before deleting the category.`
                );
                return;
            }
        } catch (e) {
            reportError(`Failed to check the links of the category: ${e}`);
            return;
        }
        ConfirmDialog.open({
            confirmMsg: `Please confirm the deletion of footer category "${label}"?`,
            confirmHandler: async () => {
                try {
                    await remove(record.id);
                } catch (e) {
                    reportError(
                        `Failed to delete the footer category "${label}": ${e}`
                    );
                }
            }
        });
    };

    return (
        <div className="content-data-grid">
            <FooterCategoryFormPopUp size={size} ref={formRef} />
            <div className="content-grid-toolbar">
                <Button
                    appearance="primary"
                    startIcon={<MdAddCircle />}
                    onClick={() => openForm()}
                >
                    Add Category
                </Button>
            </div>
            <Table autoHeight={true} data={pageRecords} loading={loading}>
                <Column width={90} align="center">
                    <HeaderCell>Move</HeaderCell>
                    <Cell style={{ padding: "6px 0" }}>
                        {(rowData) => (
                            <MoveButtons
                                index={records.findIndex(
                                    (item) => item.id === rowData?.id
                                )}
                                total={records.length}
                                disabled={loading}
                                onMove={move}
                            />
                        )}
                    </Cell>
                </Column>
                <Column width={70}>
                    <HeaderCell>Order</HeaderCell>
                    <Cell dataKey="content.order" />
                </Column>
                <Column width={200} flexGrow={1}>
                    <HeaderCell>Label</HeaderCell>
                    <Cell dataKey="content.label" />
                </Column>
                <Column width={80} align="center">
                    <HeaderCell>Links</HeaderCell>
                    <Cell>
                        {(rowData) =>
                            linkCounts
                                ? linkCounts[
                                      getLastIdSegment((rowData as RowType).id)
                                  ] || 0
                                : ""
                        }
                    </Cell>
                </Column>
                <Column width={140} fixed="right">
                    <HeaderCell align="center">Action</HeaderCell>
                    <Cell
                        verticalAlign="middle"
                        style={{ padding: "0px" }}
                        align="center"
                    >
                        {(rowData) => (
                            <div>
                                <Link
                                    to={getUrlWithPopUpQueryString(
                                        footerCategoryLinksPageUrl(
                                            size,
                                            getLastIdSegment(
                                                (rowData as RowType).id
                                            )
                                        ),
                                        location
                                    )}
                                >
                                    <IconButton
                                        size="md"
                                        title="Manage Links"
                                        aria-label="Manage Links"
                                        icon={<MdList />}
                                    />
                                </Link>{" "}
                                <IconButton
                                    size="md"
                                    title="Edit"
                                    aria-label="Edit"
                                    icon={<MdBorderColor />}
                                    onClick={() =>
                                        openForm((rowData as RowType).id)
                                    }
                                />{" "}
                                <IconButton
                                    size="md"
                                    title="Delete"
                                    aria-label="Delete"
                                    icon={<MdDeleteForever />}
                                    onClick={() =>
                                        deleteHandler(rowData as RowType)
                                    }
                                />
                            </div>
                        )}
                    </Cell>
                </Column>
            </Table>
            {pagination}
        </div>
    );
};

export default FooterCategoriesGrid;
