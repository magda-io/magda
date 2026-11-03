import React, { FunctionComponent, useRef } from "react";
import { useAsync } from "react-async-hook";
import Table from "rsuite/Table";
import Button from "rsuite/Button";
import IconButton from "rsuite/IconButton";
import { MdAddCircle, MdBorderColor, MdDeleteForever } from "react-icons/md";
import {
    ContentRecord,
    deleteContent,
    HomeStoryItem,
    queryContent
} from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import ConfirmDialog from "../ConfirmDialog";
import ContentImage from "./ContentImage";
import useOrderedContentList from "./useOrderedContentList";
import { MoveButtons } from "./ContentGridParts";
import StoryFormPopUp, {
    RefType as StoryFormPopUpRefType
} from "./StoryFormPopUp";
import {
    storyImageId,
    storyKeyFromId,
    STORY_ID_PREFIX,
    STORY_IMAGE_ID_PREFIX
} from "./homeUtils";

const { Column, HeaderCell, Cell } = Table;

type RowType = ContentRecord<HomeStoryItem>;

const HomeStoriesTab: FunctionComponent = () => {
    const formRef = useRef<StoryFormPopUpRefType>(null);
    const {
        records,
        loading,
        move,
        onChanged,
        nextOrder
    } = useOrderedContentList<HomeStoryItem>(`${STORY_ID_PREFIX}*`);

    // the ids of the existing story images; reloaded whenever the stories are
    const { result: images } = useAsync(
        async (records: RowType[]) => {
            // a new token reloads the thumbnails, in case an image was replaced
            const reloadToken = `${Math.random()}`;
            try {
                const items = await queryContent(`${STORY_IMAGE_ID_PREFIX}*`);
                return { ids: items.map((item) => item.id), reloadToken };
            } catch (e) {
                reportError(`Failed to load the story images: ${e}`);
                return { ids: [] as string[], reloadToken };
            }
        },
        [records]
    );
    const hasImage = (storyId: string) =>
        !!images && images.ids.indexOf(storyImageId(storyId)) !== -1;

    const openForm = (id?: string) =>
        formRef.current?.open(id, {
            nextOrder,
            hasImage: id ? hasImage(id) : false,
            existingKeys: records.map((item) => storyKeyFromId(item.id)),
            onComplete: onChanged
        });

    const deleteHandler = (record: RowType) => {
        ConfirmDialog.open({
            confirmMsg: `Please confirm the deletion of story "${record?.content?.title}"?`,
            confirmHandler: async () => {
                try {
                    // check again, as the image list might be outdated
                    const images = await queryContent(storyImageId(record.id));
                    for (const image of images) {
                        await deleteContent(image.id);
                    }
                    await deleteContent(record.id);
                } catch (e) {
                    reportError(`Failed to delete the story: ${e}`);
                } finally {
                    onChanged();
                }
            }
        });
    };

    return (
        <div className="home-stories-tab">
            <StoryFormPopUp ref={formRef} />
            <p className="tab-intro">
                Stories are shown below the search box of the home page, in
                order, two per row.
            </p>
            <div className="content-grid-toolbar">
                <Button
                    appearance="primary"
                    startIcon={<MdAddCircle />}
                    onClick={() => openForm()}
                >
                    Add Story
                </Button>
            </div>
            <Table
                autoHeight={true}
                data={records}
                loading={loading}
                rowKey="id"
                rowHeight={86}
            >
                <Column width={90} align="center">
                    <HeaderCell>Move</HeaderCell>
                    <Cell verticalAlign="middle" style={{ padding: "6px 0" }}>
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
                <Column width={140}>
                    <HeaderCell>Image</HeaderCell>
                    <Cell style={{ padding: "6px" }}>
                        {(rowData) => {
                            const id = (rowData as RowType).id;
                            return (
                                <ContentImage
                                    className="content-grid-thumbnail"
                                    contentId={
                                        hasImage(id)
                                            ? storyImageId(id)
                                            : undefined
                                    }
                                    reloadToken={images?.reloadToken}
                                    alt="Story"
                                />
                            );
                        }}
                    </Cell>
                </Column>
                <Column width={200} flexGrow={1}>
                    <HeaderCell>Title</HeaderCell>
                    <Cell verticalAlign="middle" dataKey="content.title" />
                </Column>
                <Column width={200} flexGrow={1}>
                    <HeaderCell>Title link</HeaderCell>
                    <Cell verticalAlign="middle" dataKey="content.titleUrl" />
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
        </div>
    );
};

export default HomeStoriesTab;
