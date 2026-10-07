import React, { FunctionComponent, useRef, useState } from "react";
import { useAsync } from "react-async-hook";
import { useDispatch } from "react-redux";
import Table from "rsuite/Table";
import Button from "rsuite/Button";
import IconButton from "rsuite/IconButton";
import Tag from "rsuite/Tag";
import {
    MdAddCircle,
    MdBorderColor,
    MdDeleteForever,
    MdStar,
    MdStarBorder
} from "react-icons/md";
import { fetchContent } from "actions/contentActions";
import {
    deleteContent,
    queryContent,
    writeContent
} from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import {
    getNextShownDates,
    isFeaturedOn,
    parseLocalDateString,
    toLocalDateString
} from "helpers/homeHighlightRotation";
import ConfirmDialog from "../ConfirmDialog";
import ContentImage from "./ContentImage";
import { MoveButtons } from "./ContentGridParts";
import { computeMoveOrderUpdates, getNextOrder } from "./contentUtils";
import HighlightFormPopUp, {
    RefType as HighlightFormPopUpRefType
} from "./HighlightFormPopUp";
import HighlightFeatureFormPopUp, {
    RefType as HighlightFeatureFormPopUpRefType
} from "./HighlightFeatureFormPopUp";
import {
    groupHighlights,
    HighlightRecord,
    HIGHLIGHT_ID_PREFIX,
    HIGHLIGHT_IMAGE_ID_PREFIX,
    pickHighlightImageSizeKey,
    highlightImageId,
    toHighlightCandidates
} from "./homeUtils";

const { Column, HeaderCell, Cell } = Table;

const formatDate = (date: Date) =>
    date.toLocaleDateString(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short"
    });

const toContentRecord = (record: HighlightRecord) => ({
    id: `${HIGHLIGHT_ID_PREFIX}${record.key}`,
    type: "application/json",
    content: record.content
});

const HomeHighlightsTab: FunctionComponent = () => {
    const dispatch = useDispatch();
    const formRef = useRef<HighlightFormPopUpRefType>(null);
    const featureFormRef = useRef<HighlightFeatureFormPopUpRefType>(null);
    const [reloadToken, setReloadToken] = useState<string>("");
    const [isUpdating, setIsUpdating] = useState<boolean>(false);

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
    // in the rotation order
    const records: HighlightRecord[] = result ? result : [];
    const contentRecords = records.map(toContentRecord);

    // the same logic as the home page
    const today = parseLocalDateString(toLocalDateString(new Date())) as Date;
    const todayString = toLocalDateString(today);
    const nextShownDates = getNextShownDates(
        toHighlightCandidates(records),
        today
    );

    // reload the list & refresh the content used by the home page
    const onChanged = () => {
        setReloadToken(`${Math.random()}`);
        dispatch(fetchContent(true) as any);
    };

    const move = async (index: number, direction: -1 | 1) => {
        const updates = computeMoveOrderUpdates(
            contentRecords,
            index,
            direction
        );
        if (!updates.length) {
            return;
        }
        setIsUpdating(true);
        try {
            for (const { id, order } of updates) {
                const record = contentRecords.find((item) => item.id === id);
                await writeContent(id, { ...record?.content, order });
            }
        } catch (e) {
            reportError(`Failed to update the highlight order: ${e}`);
        } finally {
            setIsUpdating(false);
            onChanged();
        }
    };

    const openForm = (record?: HighlightRecord) =>
        formRef.current?.open(record?.key, {
            hasContent: !!record?.content,
            imageSizeKeys: record?.imageSizeKeys,
            existingKeys: records.map((item) => item.key),
            nextOrder: getNextOrder(contentRecords),
            onComplete: onChanged
        });

    const isFeatured = (record: HighlightRecord) =>
        !!record.content &&
        isFeaturedOn(
            { key: record.key, featuredUntil: record.content.featuredUntil },
            today
        );

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
            <HighlightFeatureFormPopUp ref={featureFormRef} />
            <p className="tab-intro">
                Each highlight is a background image of the home page, with an
                optional link shown below the desktop tagline. The home page
                shows the highlights in turn, one per day, in the order below. A
                featured highlight is shown every day until its end date
                instead. When there are no highlights, the built-in background
                image is shown.
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
                loading={loading || isUpdating}
                rowKey="key"
                rowHeight={86}
            >
                <Column width={90} align="center">
                    <HeaderCell>Move</HeaderCell>
                    <Cell verticalAlign="middle" style={{ padding: "6px 0" }}>
                        {(rowData) => (
                            <MoveButtons
                                index={records.findIndex(
                                    (item) =>
                                        item.key ===
                                        (rowData as HighlightRecord).key
                                )}
                                total={records.length}
                                disabled={loading || isUpdating}
                                onMove={move}
                            />
                        )}
                    </Cell>
                </Column>
                <Column width={70}>
                    <HeaderCell>Order</HeaderCell>
                    <Cell verticalAlign="middle" dataKey="content.order" />
                </Column>
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
                <Column width={160} flexGrow={1}>
                    <HeaderCell>Link text</HeaderCell>
                    <Cell verticalAlign="middle" dataKey="content.text" />
                </Column>
                <Column width={160} flexGrow={1}>
                    <HeaderCell>Link URL</HeaderCell>
                    <Cell verticalAlign="middle" dataKey="content.url" />
                </Column>
                <Column width={130}>
                    <HeaderCell>Images</HeaderCell>
                    <Cell verticalAlign="middle">
                        {(rowData) => {
                            const record = rowData as HighlightRecord;
                            return record.imageSizeKeys.length ? (
                                <span className="highlight-image-size-list">
                                    {record.imageSizeKeys.join(", ")}
                                </span>
                            ) : (
                                <Tag color="red" size="sm">
                                    No image: not shown
                                </Tag>
                            );
                        }}
                    </Cell>
                </Column>
                <Column width={180}>
                    <HeaderCell>Shown</HeaderCell>
                    <Cell verticalAlign="middle">
                        {(rowData) => {
                            const record = rowData as HighlightRecord;
                            if (!record.imageSizeKeys.length) {
                                return null;
                            }
                            const next = nextShownDates[record.key];
                            return (
                                <div className="highlight-shown">
                                    {!next ? (
                                        <span className="highlight-shown-later">
                                            After the featured highlight
                                        </span>
                                    ) : toLocalDateString(next) ===
                                      todayString ? (
                                        <Tag color="green" size="sm">
                                            Today
                                        </Tag>
                                    ) : (
                                        <span>Next: {formatDate(next)}</span>
                                    )}
                                    {isFeatured(record) ? (
                                        <Tag
                                            color="violet"
                                            size="sm"
                                            className="highlight-featured-tag"
                                        >
                                            Featured until{" "}
                                            {formatDate(
                                                parseLocalDateString(
                                                    record.content
                                                        ?.featuredUntil as string
                                                ) as Date
                                            )}
                                        </Tag>
                                    ) : null}
                                </div>
                            );
                        }}
                    </Cell>
                </Column>
                <Column width={140} fixed="right">
                    <HeaderCell align="center">Action</HeaderCell>
                    <Cell
                        verticalAlign="middle"
                        style={{ padding: "0px" }}
                        align="center"
                    >
                        {(rowData) => {
                            const record = rowData as HighlightRecord;
                            const featured = isFeatured(record);
                            return (
                                <div>
                                    <IconButton
                                        size="md"
                                        title={
                                            !record.imageSizeKeys.length
                                                ? "A highlight with no image can't be featured"
                                                : featured
                                                ? "Featured: change or stop"
                                                : "Feature: show it every day until a date"
                                        }
                                        aria-label="Feature"
                                        className={
                                            featured
                                                ? "highlight-featured-button"
                                                : ""
                                        }
                                        icon={
                                            featured ? (
                                                <MdStar />
                                            ) : (
                                                <MdStarBorder />
                                            )
                                        }
                                        disabled={!record.imageSizeKeys.length}
                                        onClick={() =>
                                            featureFormRef.current?.open(
                                                record,
                                                {
                                                    records,
                                                    onComplete: onChanged
                                                }
                                            )
                                        }
                                    />{" "}
                                    <IconButton
                                        size="md"
                                        title="Edit"
                                        aria-label="Edit"
                                        icon={<MdBorderColor />}
                                        onClick={() => openForm(record)}
                                    />{" "}
                                    <IconButton
                                        size="md"
                                        title="Delete"
                                        aria-label="Delete"
                                        icon={<MdDeleteForever />}
                                        onClick={() => deleteHandler(record)}
                                    />
                                </div>
                            );
                        }}
                    </Cell>
                </Column>
            </Table>
            <div className="pagination-container">Total: {records.length}</div>
        </div>
    );
};

export default HomeHighlightsTab;
