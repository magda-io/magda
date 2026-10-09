import React, { FunctionComponent, useRef, useState } from "react";
import { useAsync } from "react-async-hook";
import sortBy from "lodash/sortBy";
import Table from "rsuite/Table";
import Button from "rsuite/Button";
import IconButton from "rsuite/IconButton";
import {
    MdAddCircle,
    MdBorderColor,
    MdDeleteForever,
    MdOpenInNew
} from "react-icons/md";
import {
    ContentRecord,
    deleteContent,
    PageItem,
    queryContent
} from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import getAbsoluteUrlPath from "helpers/getAbsoluteUrlPath";
import ConfirmDialog from "../ConfirmDialog";
import ContentSettingsLayout from "./ContentSettingsLayout";
import { usePagedRecords } from "./ContentGridParts";
import { pageIdToSlug, PAGE_ID_PREFIX } from "./contentUtils";
import PageFormPopUp, {
    RefType as PageFormPopUpRefType
} from "./PageFormPopUp";

const { Column, HeaderCell, Cell } = Table;

type RowType = ContentRecord<PageItem>;

const PagesSettingsPage: FunctionComponent = () => {
    const formRef = useRef<PageFormPopUpRefType>(null);
    const [reloadToken, setReloadToken] = useState<string>("");

    const { result, loading } = useAsync(
        async (reloadToken: string) => {
            try {
                const records = await queryContent<PageItem>(
                    `${PAGE_ID_PREFIX}*`
                );
                return sortBy(
                    records.filter((item) => item.type === "application/json"),
                    (item) => item.id
                );
            } catch (e) {
                reportError(`Failed to load pages: ${e}`);
                throw e;
            }
        },
        [reloadToken]
    );
    const records: RowType[] = result ? result : [];
    const { pageRecords, pagination } = usePagedRecords(records);
    const reload = () => setReloadToken(`${Math.random()}`);

    const openForm = (id?: string) =>
        formRef.current?.open(id, {
            existingSlugs: records.map((item) => pageIdToSlug(item.id)),
            onComplete: reload
        });

    const deleteHandler = (record: RowType) => {
        const slug = pageIdToSlug(record.id);
        ConfirmDialog.open({
            confirmMsg: `Please confirm the deletion of page "${record?.content?.title}" (/page/${slug})?`,
            confirmHandler: async () => {
                try {
                    await deleteContent(record.id);
                    reload();
                } catch (e) {
                    reportError(`Failed to delete the page: ${e}`);
                }
            }
        });
    };

    return (
        <ContentSettingsLayout
            className="pages-settings-page"
            breadcrumbs={[{ to: "/settings/content/pages", title: "Pages" }]}
        >
            <PageFormPopUp ref={formRef} />
            <p className="page-intro">
                Manage static pages written in markdown. A page is available at{" "}
                <code>/page/&lt;slug&gt;</code> and can be linked from the
                header or footer.
            </p>
            <div className="content-grid-toolbar">
                <Button
                    appearance="primary"
                    startIcon={<MdAddCircle />}
                    onClick={() => openForm()}
                >
                    Create Page
                </Button>
            </div>
            <Table autoHeight={true} data={pageRecords} loading={loading}>
                <Column width={250} resizable>
                    <HeaderCell>Title</HeaderCell>
                    <Cell dataKey="content.title" />
                </Column>
                <Column width={200} flexGrow={1}>
                    <HeaderCell>URL</HeaderCell>
                    <Cell>
                        {(rowData) => `/page/${pageIdToSlug(rowData.id)}`}
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
                                <IconButton
                                    as="a"
                                    size="md"
                                    title="Open the page in a new window"
                                    aria-label="Open the page in a new window"
                                    icon={<MdOpenInNew />}
                                    href={getAbsoluteUrlPath(
                                        `/page/${pageIdToSlug(rowData.id)}`
                                    )}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                />{" "}
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
        </ContentSettingsLayout>
    );
};

export default PagesSettingsPage;
