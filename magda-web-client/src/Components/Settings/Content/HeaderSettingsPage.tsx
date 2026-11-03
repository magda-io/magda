import React, { FunctionComponent, useRef } from "react";
import Table from "rsuite/Table";
import Button from "rsuite/Button";
import IconButton from "rsuite/IconButton";
import Tag from "rsuite/Tag";
import { MdAddCircle, MdBorderColor, MdDeleteForever } from "react-icons/md";
import { ContentRecord, HeaderNavigationItem } from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import ConfirmDialog from "../ConfirmDialog";
import ContentSettingsLayout from "./ContentSettingsLayout";
import useOrderedContentList from "./useOrderedContentList";
import { MoveButtons } from "./ContentGridParts";
import HeaderNavigationFormPopUp, {
    RefType as HeaderNavigationFormPopUpRefType
} from "./HeaderNavigationFormPopUp";

const { Column, HeaderCell, Cell } = Table;

type RowType = ContentRecord<HeaderNavigationItem>;

const HeaderSettingsPage: FunctionComponent = () => {
    const formRef = useRef<HeaderNavigationFormPopUpRefType>(null);
    const {
        records,
        loading,
        move,
        remove,
        onChanged,
        nextOrder
    } = useOrderedContentList<HeaderNavigationItem>("header/navigation/*");

    const authItemId = records.find((item) => !!item?.content?.auth)?.id;

    const openForm = (id?: string) =>
        formRef.current?.open(id, {
            nextOrder,
            authItemId,
            onComplete: onChanged
        });

    const deleteHandler = (record: RowType) => {
        const label = record?.content?.auth
            ? "Account menu"
            : record?.content?.default?.label;
        ConfirmDialog.open({
            confirmMsg: `Please confirm the deletion of header menu item "${label}"?`,
            confirmHandler: async () => {
                try {
                    await remove(record.id);
                } catch (e) {
                    reportError(
                        `Failed to delete the header menu item "${label}": ${e}`
                    );
                }
            }
        });
    };

    return (
        <ContentSettingsLayout
            className="header-settings-page"
            breadcrumbs={[{ to: "/settings/content/header", title: "Header" }]}
        >
            <HeaderNavigationFormPopUp ref={formRef} />
            <p className="page-intro">
                Manage the navigation menu items shown in the site header.
            </p>
            <div className="content-grid-toolbar">
                <Button
                    appearance="primary"
                    startIcon={<MdAddCircle />}
                    onClick={() => openForm()}
                >
                    Add Menu Item
                </Button>
            </div>
            <Table autoHeight={true} data={records} loading={loading}>
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
                <Column width={160} resizable>
                    <HeaderCell>Label</HeaderCell>
                    <Cell>
                        {(rowData) =>
                            (rowData as RowType)?.content?.auth ? (
                                <i>Account menu</i>
                            ) : (
                                (rowData as RowType)?.content?.default?.label
                            )
                        }
                    </Cell>
                </Column>
                <Column width={140}>
                    <HeaderCell>Type</HeaderCell>
                    <Cell>
                        {(rowData) =>
                            (rowData as RowType)?.content?.auth ? (
                                <Tag color="violet">Account menu</Tag>
                            ) : (
                                <Tag>Link</Tag>
                            )
                        }
                    </Cell>
                </Column>
                <Column width={200} flexGrow={1}>
                    <HeaderCell>URL</HeaderCell>
                    <Cell dataKey="content.default.href" />
                </Column>
                <Column width={110}>
                    <HeaderCell>New window</HeaderCell>
                    <Cell>
                        {(rowData) => {
                            const content = (rowData as RowType)?.content;
                            if (content?.auth) {
                                return "";
                            }
                            return content?.default?.target
                                ? content.default.target === "_blank"
                                    ? "Yes"
                                    : `Yes (${content.default.target})`
                                : "No";
                        }}
                    </Cell>
                </Column>
                <Column width={140}>
                    <HeaderCell>Rel</HeaderCell>
                    <Cell dataKey="content.default.rel" />
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
            <div className="pagination-container">Total: {records.length}</div>
        </ContentSettingsLayout>
    );
};

export default HeaderSettingsPage;
