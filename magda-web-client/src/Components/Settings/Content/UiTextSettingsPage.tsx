import React, { FunctionComponent, useRef, useState } from "react";
import { useAsync } from "react-async-hook";
import Table from "rsuite/Table";
import IconButton from "rsuite/IconButton";
import Input from "rsuite/Input";
import InputGroup from "rsuite/InputGroup";
import Message from "rsuite/Message";
import Tag from "rsuite/Tag";
import { MdBorderColor, MdRestore, MdSearch } from "react-icons/md";
import { queryContent, writeContent } from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import ConfirmDialog from "../ConfirmDialog";
import ContentSettingsLayout from "./ContentSettingsLayout";
import UiTextFormPopUp, {
    RefType as UiTextFormPopUpRefType
} from "./UiTextFormPopUp";
import {
    buildUiTextRecords,
    filterUiTextRecords,
    isUiTextModified,
    UiTextRecord,
    UI_TEXT_ID_PREFIX,
    UI_TEXT_LANGUAGE_LABEL
} from "./uiTextUtils";

const { Column, HeaderCell, Cell } = Table;

const UiTextSettingsPage: FunctionComponent = () => {
    const formRef = useRef<UiTextFormPopUpRefType>(null);
    const [reloadToken, setReloadToken] = useState<string>("");
    const [keyword, setKeyword] = useState<string>("");

    const { result, loading } = useAsync(
        async (reloadToken: string) => {
            try {
                return buildUiTextRecords(
                    await queryContent(`${UI_TEXT_ID_PREFIX}*`)
                );
            } catch (e) {
                reportError(`Failed to load the UI texts: ${e}`);
                throw e;
            }
        },
        [reloadToken]
    );
    const records = filterUiTextRecords(result ? result : [], keyword);
    const reload = () => setReloadToken(`${Math.random()}`);

    const resetHandler = (item: UiTextRecord) => {
        ConfirmDialog.open({
            confirmMsg: `Please confirm resetting "${item.namespace} / ${
                item.key
            }" to the default text${
                item.defaultValue ? ` "${item.defaultValue}"` : " (empty)"
            }?`,
            confirmHandler: async () => {
                try {
                    await writeContent(
                        item.id,
                        item.defaultValue ? item.defaultValue : "",
                        "text/plain"
                    );
                } catch (e) {
                    reportError(`Failed to reset the text: ${e}`);
                } finally {
                    reload();
                }
            }
        });
    };

    return (
        <ContentSettingsLayout
            className="ui-text-settings-page"
            breadcrumbs={[
                { to: "/settings/content/ui-text", title: "UI Text" }
            ]}
        >
            <UiTextFormPopUp ref={formRef} />
            <p className="page-intro">
                Manage the text strings shown in the site's user interface, e.g.
                the site name and the titles of the organisation pages. The
                texts are stored per language. The site is currently shown in{" "}
                {UI_TEXT_LANGUAGE_LABEL}.
            </p>
            <Message showIcon type="info" className="ui-text-cache-note">
                Pages load these texts when they're opened, and the texts may be
                cached for up to 60 seconds. Reload a page to see a change.
            </Message>
            <div className="content-grid-toolbar">
                <InputGroup className="ui-text-search" inside>
                    <Input
                        placeholder="Search texts..."
                        value={keyword}
                        onChange={(value) => setKeyword(value)}
                    />
                    <InputGroup.Addon>
                        <MdSearch />
                    </InputGroup.Addon>
                </InputGroup>
            </div>
            <Table
                autoHeight={true}
                data={records}
                loading={loading}
                rowKey="id"
                wordWrap="break-word"
            >
                <Column width={170}>
                    <HeaderCell>Section</HeaderCell>
                    <Cell dataKey="namespace" />
                </Column>
                <Column width={210}>
                    <HeaderCell>Key</HeaderCell>
                    <Cell dataKey="key" />
                </Column>
                <Column width={220}>
                    <HeaderCell>Used for</HeaderCell>
                    <Cell dataKey="description" />
                </Column>
                <Column width={110}>
                    <HeaderCell>Language</HeaderCell>
                    <Cell>{() => UI_TEXT_LANGUAGE_LABEL}</Cell>
                </Column>
                <Column width={260} flexGrow={1}>
                    <HeaderCell>Text</HeaderCell>
                    <Cell>
                        {(rowData) => {
                            const item = rowData as UiTextRecord;
                            if (typeof item.value !== "string") {
                                return (
                                    <i className="ui-text-not-set">
                                        Not set: the built-in text is used
                                    </i>
                                );
                            }
                            return (
                                <>
                                    {item.value ? (
                                        item.value
                                    ) : (
                                        <i className="ui-text-empty">(empty)</i>
                                    )}
                                    {isUiTextModified(item) ? (
                                        <Tag
                                            color="orange"
                                            size="sm"
                                            className="ui-text-modified-tag"
                                        >
                                            Modified
                                        </Tag>
                                    ) : null}
                                </>
                            );
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
                        {(rowData) => {
                            const item = rowData as UiTextRecord;
                            const canReset =
                                typeof item.defaultValue === "string" &&
                                item.value !== item.defaultValue;
                            return (
                                <div>
                                    <IconButton
                                        size="md"
                                        title="Edit"
                                        aria-label="Edit"
                                        icon={<MdBorderColor />}
                                        onClick={() =>
                                            formRef.current?.open(item, reload)
                                        }
                                    />{" "}
                                    <IconButton
                                        size="md"
                                        title="Reset to default"
                                        aria-label="Reset to default"
                                        icon={<MdRestore />}
                                        disabled={!canReset}
                                        onClick={() => resetHandler(item)}
                                    />
                                </div>
                            );
                        }}
                    </Cell>
                </Column>
            </Table>
            <div className="pagination-container">Total: {records.length}</div>
        </ContentSettingsLayout>
    );
};

export default UiTextSettingsPage;
