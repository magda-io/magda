import React, { FunctionComponent, useRef, useState } from "react";
import { useAsync } from "react-async-hook";
import { useDispatch, useSelector } from "react-redux";
import Table from "rsuite/Table";
import Button from "rsuite/Button";
import IconButton from "rsuite/IconButton";
import Tag from "rsuite/Tag";
import TagGroup from "rsuite/TagGroup";
import { MdAddCircle, MdBorderColor, MdDeleteForever } from "react-icons/md";
import { fetchContent } from "actions/contentActions";
import { deleteContent, queryContent } from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import { StateType } from "reducers/reducer";
import ConfirmDialog from "../ConfirmDialog";
import ContentImage from "./ContentImage";
import HighlightFormPopUp, {
    RefType as HighlightFormPopUpRefType
} from "./HighlightFormPopUp";
import {
    groupHighlights,
    HighlightRecord,
    HIGHLIGHT_ID_PREFIX,
    HIGHLIGHT_IMAGE_ID_PREFIX,
    pickHighlightImageSizeKey,
    highlightImageId
} from "./homeUtils";

const { Column, HeaderCell, Cell } = Table;

const HomeHighlightsTab: FunctionComponent = () => {
    const dispatch = useDispatch();
    const formRef = useRef<HighlightFormPopUpRefType>(null);
    const [reloadToken, setReloadToken] = useState<string>("");
    // the background images the home page shows today
    const shownImageUrls = useSelector<StateType, string[]>((state) =>
        Array.isArray(state?.content?.backgroundImageUrls)
            ? state.content.backgroundImageUrls
            : []
    );

    const { result, loading } = useAsync(
        async (reloadToken: string) => {
            try {
                return groupHighlights(
                    await queryContent([
                        `${HIGHLIGHT_ID_PREFIX}*`,
                        `${HIGHLIGHT_IMAGE_ID_PREFIX}*`
                    ])
                );
            } catch (e) {
                reportError(`Failed to load the highlights: ${e}`);
                throw e;
            }
        },
        [reloadToken]
    );
    const records: HighlightRecord[] = result ? result : [];

    // reload the list & refresh the content used by the home page
    const onChanged = () => {
        setReloadToken(`${Math.random()}`);
        dispatch(fetchContent(true) as any);
    };

    const isShownToday = (record: HighlightRecord) =>
        shownImageUrls.some(
            (url) =>
                typeof url === "string" &&
                url.indexOf(`${HIGHLIGHT_IMAGE_ID_PREFIX}${record.key}/`) !== -1
        );

    const openForm = (record?: HighlightRecord) =>
        formRef.current?.open(record?.key, {
            hasContent: !!record?.content,
            imageSizeKeys: record?.imageSizeKeys,
            existingKeys: records.map((item) => item.key),
            onComplete: onChanged
        });

    const deleteHandler = (record: HighlightRecord) => {
        ConfirmDialog.open({
            confirmMsg: `Please confirm the deletion of the highlight${
                record?.content?.text ? ` "${record.content.text}"` : ""
            } and its background images?`,
            confirmHandler: async () => {
                try {
                    // the list might be outdated: find all the images
                    const images = await queryContent(
                        `${HIGHLIGHT_IMAGE_ID_PREFIX}${record.key}/*`
                    );
                    for (const image of images) {
                        await deleteContent(image.id);
                    }
                    if (record.content) {
                        await deleteContent(
                            `${HIGHLIGHT_ID_PREFIX}${record.key}`
                        );
                    }
                } catch (e) {
                    reportError(`Failed to delete the highlight: ${e}`);
                } finally {
                    onChanged();
                }
            }
        });
    };

    return (
        <div className="home-highlights-tab">
            <HighlightFormPopUp ref={formRef} />
            <p className="tab-intro">
                Each highlight is a background image of the home page, with an
                optional link shown below the desktop tagline. The home page
                shows one highlight per day, picked by the day of the month.
                When there are no highlights, the built-in background image is
                shown.
            </p>
            <div className="content-grid-toolbar">
                <Button
                    appearance="primary"
                    startIcon={<MdAddCircle />}
                    onClick={() => openForm()}
                >
                    Add Highlight
                </Button>
            </div>
            <Table
                autoHeight={true}
                data={records}
                loading={loading}
                rowKey="key"
                rowHeight={86}
            >
                <Column width={140}>
                    <HeaderCell>Image</HeaderCell>
                    <Cell style={{ padding: "6px" }}>
                        {(rowData) => {
                            const record = rowData as HighlightRecord;
                            const sizeKey = pickHighlightImageSizeKey(
                                record.imageSizeKeys
                            );
                            return (
                                <ContentImage
                                    className="content-grid-thumbnail"
                                    contentId={
                                        sizeKey
                                            ? highlightImageId(
                                                  record.key,
                                                  sizeKey
                                              )
                                            : undefined
                                    }
                                    reloadToken={reloadToken}
                                    alt="Highlight background"
                                />
                            );
                        }}
                    </Cell>
                </Column>
                <Column width={180} flexGrow={1}>
                    <HeaderCell>Link text</HeaderCell>
                    <Cell dataKey="content.text" />
                </Column>
                <Column width={180} flexGrow={1}>
                    <HeaderCell>Link URL</HeaderCell>
                    <Cell dataKey="content.url" />
                </Column>
                <Column width={200}>
                    <HeaderCell>Images</HeaderCell>
                    <Cell>
                        {(rowData) => {
                            const record = rowData as HighlightRecord;
                            return record.imageSizeKeys.length ? (
                                <TagGroup>
                                    {record.imageSizeKeys.map((key) => (
                                        <Tag key={key} size="sm">
                                            {key}
                                        </Tag>
                                    ))}
                                </TagGroup>
                            ) : (
                                <Tag color="red" size="sm">
                                    No image: not shown
                                </Tag>
                            );
                        }}
                    </Cell>
                </Column>
                <Column width={110}>
                    <HeaderCell>Status</HeaderCell>
                    <Cell>
                        {(rowData) =>
                            isShownToday(rowData as HighlightRecord) ? (
                                <Tag color="green" size="sm">
                                    Shown today
                                </Tag>
                            ) : null
                        }
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
                                        openForm(rowData as HighlightRecord)
                                    }
                                />{" "}
                                <IconButton
                                    size="md"
                                    title="Delete"
                                    aria-label="Delete"
                                    icon={<MdDeleteForever />}
                                    onClick={() =>
                                        deleteHandler(
                                            rowData as HighlightRecord
                                        )
                                    }
                                />
                            </div>
                        )}
                    </Cell>
                </Column>
            </Table>
            <div className="pagination-container">Total: {records.length}</div>
        </div>
    );
};

export default HomeHighlightsTab;
