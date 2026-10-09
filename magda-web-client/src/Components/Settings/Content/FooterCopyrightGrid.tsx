import React, { FunctionComponent, useRef } from "react";
import Table from "rsuite/Table";
import Button from "rsuite/Button";
import IconButton from "rsuite/IconButton";
import { MdAddCircle, MdBorderColor, MdDeleteForever } from "react-icons/md";
import { ContentRecord, FooterCopyrightItem } from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import ConfirmDialog from "../ConfirmDialog";
import useOrderedContentList from "./useOrderedContentList";
import { MoveButtons, usePagedRecords } from "./ContentGridParts";
import FooterCopyrightFormPopUp, {
    RefType as FooterCopyrightFormPopUpRefType
} from "./FooterCopyrightFormPopUp";
import FooterCopyrightPreview from "./FooterCopyrightPreview";

const { Column, HeaderCell, Cell } = Table;

type RowType = ContentRecord<FooterCopyrightItem>;

const FooterCopyrightGrid: FunctionComponent = () => {
    const formRef = useRef<FooterCopyrightFormPopUpRefType>(null);
    const {
        records,
        loading,
        move,
        remove,
        onChanged,
        nextOrder
    } = useOrderedContentList<FooterCopyrightItem>("footer/copyright/*");
    const { pageRecords, pagination } = usePagedRecords(records);

    const openForm = (id?: string) =>
        formRef.current?.open(id, { nextOrder, onComplete: onChanged });

    const deleteHandler = (record: RowType) => {
        const order = record?.content?.order;
        ConfirmDialog.open({
            confirmMsg: `Please confirm the deletion of the footer copyright item with order ${order}?`,
            confirmHandler: async () => {
                try {
                    await remove(record.id);
                } catch (e) {
                    reportError(
                        `Failed to delete the footer copyright item: ${e}`
                    );
                }
            }
        });
    };

    return (
        <div className="content-data-grid">
            <FooterCopyrightFormPopUp ref={formRef} />
            <div className="content-grid-toolbar">
                <Button
                    appearance="primary"
                    startIcon={<MdAddCircle />}
                    onClick={() => openForm()}
                >
                    Add Copyright Item
                </Button>
            </div>
            <Table
                autoHeight={true}
                rowHeight={70}
                data={pageRecords}
                loading={loading}
            >
                <Column width={90} align="center">
                    <HeaderCell>Move</HeaderCell>
                    <Cell verticalAlign="middle" style={{ padding: "0" }}>
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
                    <Cell verticalAlign="middle" dataKey="content.order" />
                </Column>
                <Column width={300} flexGrow={1}>
                    <HeaderCell>Preview</HeaderCell>
                    <Cell verticalAlign="middle" style={{ padding: "4px" }}>
                        {(rowData) => (
                            <FooterCopyrightPreview
                                compact={true}
                                item={(rowData as RowType)?.content || {}}
                            />
                        )}
                    </Cell>
                </Column>
                <Column width={200}>
                    <HeaderCell>Logo link URL</HeaderCell>
                    <Cell verticalAlign="middle" dataKey="content.href" />
                </Column>
                <Column width={100} fixed="right">
                    <HeaderCell align="center">Action</HeaderCell>
                    <Cell
                        verticalAlign="middle"
                        style={{ padding: "0px" }}
                        align="center"
                    >
                        {(rowData) => (
                            <div>
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

export default FooterCopyrightGrid;
