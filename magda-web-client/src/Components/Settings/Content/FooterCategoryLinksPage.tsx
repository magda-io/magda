import React, { FunctionComponent, useRef } from "react";
import { useAsync } from "react-async-hook";
import { Redirect, useParams } from "react-router-dom";
import Table from "rsuite/Table";
import Button from "rsuite/Button";
import IconButton from "rsuite/IconButton";
import Message from "rsuite/Message";
import { MdAddCircle, MdBorderColor, MdDeleteForever } from "react-icons/md";
import {
    ContentRecord,
    FooterCategoryItem,
    FooterLinkItem,
    getContent
} from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import ConfirmDialog from "../ConfirmDialog";
import ContentSettingsLayout from "./ContentSettingsLayout";
import useOrderedContentList from "./useOrderedContentList";
import { MoveButtons, usePagedRecords } from "./ContentGridParts";
import FooterLinkFormPopUp, {
    RefType as FooterLinkFormPopUpRefType
} from "./FooterLinkFormPopUp";
import {
    FooterSize,
    footerCategoryIdPrefix,
    footerCategoryLinksIdPrefix,
    footerSizeLabel,
    FOOTER_SETTINGS_BASE_URL,
    isFooterSize
} from "./footerUtils";

const { Column, HeaderCell, Cell } = Table;

type RowType = ContentRecord<FooterLinkItem>;

const FooterCategoryLinksGrid: FunctionComponent<{
    size: FooterSize;
    categoryKey: string;
}> = ({ size, categoryKey }) => {
    const formRef = useRef<FooterLinkFormPopUpRefType>(null);
    const {
        records,
        loading,
        move,
        remove,
        onChanged,
        nextOrder
    } = useOrderedContentList<FooterLinkItem>(
        `${footerCategoryLinksIdPrefix(size, categoryKey)}*`
    );
    const { pageRecords, pagination } = usePagedRecords(records);

    const openForm = (id?: string) =>
        formRef.current?.open(id, { nextOrder, onComplete: onChanged });

    const deleteHandler = (record: RowType) => {
        const label = record?.content?.label;
        ConfirmDialog.open({
            confirmMsg: `Please confirm the deletion of footer link "${label}"?`,
            confirmHandler: async () => {
                try {
                    await remove(record.id);
                } catch (e) {
                    reportError(
                        `Failed to delete the footer link "${label}": ${e}`
                    );
                }
            }
        });
    };

    return (
        <div className="content-data-grid">
            <FooterLinkFormPopUp
                ref={formRef}
                size={size}
                categoryKey={categoryKey}
            />
            <div className="content-grid-toolbar">
                <Button
                    appearance="primary"
                    startIcon={<MdAddCircle />}
                    onClick={() => openForm()}
                >
                    Add Link
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
                <Column width={180} resizable>
                    <HeaderCell>Label</HeaderCell>
                    <Cell dataKey="content.label" />
                </Column>
                <Column width={200} flexGrow={1}>
                    <HeaderCell>URL</HeaderCell>
                    <Cell dataKey="content.href" />
                </Column>
                <Column width={130}>
                    <HeaderCell>Opens in</HeaderCell>
                    <Cell>
                        {(rowData) => {
                            const target = (rowData as RowType)?.content
                                ?.target;
                            return !target
                                ? "Default"
                                : target === "_self"
                                ? "Same window"
                                : target === "_blank"
                                ? "New window"
                                : target;
                        }}
                    </Cell>
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

const FooterCategoryLinksPage: FunctionComponent = () => {
    const { size, categoryKey } = useParams<{
        size: string;
        categoryKey: string;
    }>();
    const validSize = isFooterSize(size);

    const { result: category, error } = useAsync(
        async (size: string, categoryKey: string, validSize: boolean) => {
            if (!validSize) {
                return undefined;
            }
            try {
                return await getContent<FooterCategoryItem>(
                    `${footerCategoryIdPrefix(
                        size as FooterSize
                    )}${categoryKey}`
                );
            } catch (e) {
                reportError(`Failed to load the footer category: ${e}`);
                throw e;
            }
        },
        [size, categoryKey, validSize]
    );

    if (!validSize) {
        return <Redirect to={`${FOOTER_SETTINGS_BASE_URL}/medium`} />;
    }

    const sizeLabel = footerSizeLabel(size as FooterSize);

    return (
        <ContentSettingsLayout
            className="footer-category-links-page"
            breadcrumbs={[
                {
                    to: `${FOOTER_SETTINGS_BASE_URL}/${size}`,
                    title: `Footer (${sizeLabel})`
                },
                {
                    title: `Links of category: ${
                        category?.label ? category.label : "..."
                    }`
                }
            ]}
        >
            <p className="page-intro">
                Manage the links shown under this category in the{" "}
                {sizeLabel.toLowerCase()} footer.
            </p>
            {error ? (
                <Message showIcon type="error" header="Error">
                    Failed to load the footer category: {`${error}`}
                </Message>
            ) : (
                <FooterCategoryLinksGrid
                    size={size as FooterSize}
                    categoryKey={categoryKey}
                />
            )}
        </ContentSettingsLayout>
    );
};

export default FooterCategoryLinksPage;
