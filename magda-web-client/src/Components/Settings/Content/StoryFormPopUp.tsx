import React, {
    forwardRef,
    ForwardRefRenderFunction,
    useEffect,
    useImperativeHandle,
    useRef,
    useState
} from "react";
import { useAsyncCallback } from "react-async-hook";
import omit from "lodash/omit";
import Modal from "rsuite/Modal";
import Button from "rsuite/Button";
import ButtonToolbar from "rsuite/ButtonToolbar";
import Form, { FormInstance } from "rsuite/Form";
import Schema from "rsuite/Schema";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Placeholder from "rsuite/Placeholder";
import { MdImage } from "react-icons/md";
import {
    deleteContent,
    HomeStoryItem,
    writeContent
} from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import humanFileSize from "helpers/humanFileSize";
import useContentFormState from "./useContentFormState";
import MarkdownEditor from "./MarkdownEditor";
import ContentImage from "./ContentImage";
import { isValidHeaderHref } from "./contentUtils";
import { MAX_IMAGE_FILE_SIZE, SUPPORTED_IMAGE_TYPES } from "./imageUtils";
import {
    emptyStoryFormValue,
    formValueToStory,
    generateHomeItemKey,
    storyImageId,
    storyToFormValue,
    StoryFormValue,
    STORY_ID_PREFIX
} from "./homeUtils";

type PropsType = object;

export type RefType = {
    open: (
        id: string | undefined,
        options: {
            nextOrder: number;
            hasImage?: boolean;
            existingKeys: string[];
            onComplete?: (id: string) => void;
        }
    ) => void;
};

const model = Schema.Model<StoryFormValue>({
    title: Schema.Types.StringType().isRequired("Title is required."),
    titleUrl: Schema.Types.StringType().addRule(
        (value) => isValidHeaderHref(value),
        "Please enter a site path (e.g. /page/about) or a full URL (e.g. https://example.com)."
    ),
    order: Schema.Types.NumberType("Please enter a number.").isRequired(
        "Order is required."
    ),
    content: Schema.Types.StringType().isRequired("Content is required.")
});

type SelectedImage = {
    file: File;
    url: string;
};

const StoryFormPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    props,
    ref
) => {
    const formRef = useRef<FormInstance>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [existingKeys, setExistingKeys] = useState<string[]>([]);
    const [hasImage, setHasImage] = useState<boolean>(false);
    const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(
        null
    );
    const [removeImage, setRemoveImage] = useState<boolean>(false);
    const [imageError, setImageError] = useState<string>("");

    const state = useContentFormState<HomeStoryItem, StoryFormValue>(
        storyToFormValue,
        emptyStoryFormValue()
    );
    const { formValue, setFormValue, isCreateForm } = state;

    // release the object URL of the selected image when it's no longer in use
    useEffect(
        () => () => {
            if (selectedImage?.url) URL.revokeObjectURL(selectedImage.url);
        },
        [selectedImage]
    );

    useImperativeHandle(ref, () => ({
        open: (id, { nextOrder, hasImage, existingKeys, onComplete }) => {
            setExistingKeys(existingKeys);
            setHasImage(!!id && !!hasImage);
            setSelectedImage(null);
            setRemoveImage(false);
            setImageError("");
            state.open(id, {
                initialValue: emptyStoryFormValue(nextOrder),
                onComplete
            });
        }
    }));

    const onSelectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) {
            return;
        }
        if (SUPPORTED_IMAGE_TYPES.indexOf(file.type) === -1) {
            setImageError(
                "Please select a PNG, GIF, JPEG, WebP or SVG image file."
            );
            return;
        }
        if (file.size > MAX_IMAGE_FILE_SIZE) {
            setImageError(
                `The file is too big (${humanFileSize(
                    file.size
                )}). The maximum size is ${humanFileSize(MAX_IMAGE_FILE_SIZE)}.`
            );
            return;
        }
        setImageError("");
        setRemoveImage(false);
        setSelectedImage({ file, url: URL.createObjectURL(file) });
    };

    const submitData = useAsyncCallback(async () => {
        if (!formRef.current?.check()) {
            return;
        }
        const id = state.contentId
            ? state.contentId
            : `${STORY_ID_PREFIX}${generateHomeItemKey(existingKeys)}`;
        try {
            await writeContent(id, formValueToStory(formValue));
            if (selectedImage) {
                await writeContent(
                    storyImageId(id),
                    await selectedImage.file.arrayBuffer(),
                    selectedImage.file.type
                );
            } else if (removeImage && hasImage) {
                await deleteContent(storyImageId(id));
            }
            state.complete(id);
        } catch (e) {
            reportError(
                `Failed to ${
                    isCreateForm ? "create" : "update"
                } the story: ${e}`
            );
        }
    });

    const renderImage = () => {
        if (selectedImage) {
            return <img src={selectedImage.url} alt="New story" />;
        }
        if (hasImage && !removeImage && state.contentId) {
            return (
                <ContentImage
                    contentId={storyImageId(state.contentId)}
                    alt="Current story"
                />
            );
        }
        return (
            <div className="no-image">
                <MdImage />
                <span>No image</span>
            </div>
        );
    };

    return (
        <Modal
            className="content-settings-form-popup story-form-popup"
            backdrop="static"
            keyboard={false}
            open={state.isOpen}
            size="lg"
            overflow={true}
            onClose={state.close}
        >
            <Modal.Header>
                <Modal.Title>
                    {isCreateForm ? "Add Story" : "Update Story"}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {state.loading ? (
                    <Placeholder.Paragraph rows={10}>
                        <Loader center content="loading" />
                    </Placeholder.Paragraph>
                ) : state.loadError ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve the story: {`${state.loadError}`}
                    </Message>
                ) : (
                    <>
                        {submitData.loading ? (
                            <Loader
                                backdrop
                                content="Saving story..."
                                vertical
                            />
                        ) : null}
                        <Form
                            ref={formRef}
                            model={model}
                            fluid
                            disabled={submitData.loading}
                            formValue={formValue}
                            onChange={(v) =>
                                setFormValue({
                                    ...formValue,
                                    ...(v as Partial<StoryFormValue>)
                                })
                            }
                            onCheck={state.setFormError}
                        >
                            <Form.Group controlId="ctrl-title">
                                <Form.ControlLabel>Title</Form.ControlLabel>
                                <Form.Control name="title" />
                            </Form.Group>
                            <Form.Group controlId="ctrl-image">
                                <Form.ControlLabel>Image</Form.ControlLabel>
                                <div className="story-image-select">
                                    <div className="story-image-thumbnail">
                                        {renderImage()}
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept={SUPPORTED_IMAGE_TYPES.join(",")}
                                        style={{ display: "none" }}
                                        onChange={onSelectFile}
                                    />
                                    <ButtonToolbar>
                                        <Button
                                            onClick={() =>
                                                fileInputRef.current?.click()
                                            }
                                        >
                                            {selectedImage ||
                                            (hasImage && !removeImage)
                                                ? "Change image..."
                                                : "Select image..."}
                                        </Button>
                                        {selectedImage ? (
                                            <Button
                                                appearance="subtle"
                                                onClick={() =>
                                                    setSelectedImage(null)
                                                }
                                            >
                                                {hasImage && !removeImage
                                                    ? "Keep the current image"
                                                    : "Clear"}
                                            </Button>
                                        ) : hasImage && !removeImage ? (
                                            <Button
                                                appearance="subtle"
                                                onClick={() =>
                                                    setRemoveImage(true)
                                                }
                                            >
                                                Remove image
                                            </Button>
                                        ) : hasImage && removeImage ? (
                                            <Button
                                                appearance="subtle"
                                                onClick={() =>
                                                    setRemoveImage(false)
                                                }
                                            >
                                                Undo remove
                                            </Button>
                                        ) : null}
                                    </ButtonToolbar>
                                </div>
                                {imageError ? (
                                    <div className="image-error" role="alert">
                                        {imageError}
                                    </div>
                                ) : null}
                                <Form.HelpText>
                                    Optional. PNG, GIF, JPEG, WebP or SVG. The
                                    home page shows the title (and its link)
                                    over the image, so a story with no image
                                    shows its content only.
                                </Form.HelpText>
                            </Form.Group>
                            <Form.Group controlId="ctrl-titleUrl">
                                <Form.ControlLabel>
                                    Title link
                                </Form.ControlLabel>
                                <Form.Control
                                    name="titleUrl"
                                    placeholder="Optional: e.g. https://example.com or /page/about"
                                />
                                <Form.HelpText>
                                    Where the image & title link to (opens in a
                                    new window).
                                </Form.HelpText>
                            </Form.Group>
                            <Form.Group controlId="ctrl-order">
                                <Form.ControlLabel>Order</Form.ControlLabel>
                                <Form.Control name="order" type="number" />
                                <Form.HelpText>
                                    Stories are shown in ascending order, two
                                    per row.
                                </Form.HelpText>
                            </Form.Group>
                            <Form.Group controlId="ctrl-content">
                                <Form.ControlLabel>
                                    Content (markdown)
                                </Form.ControlLabel>
                                <MarkdownEditor
                                    value={formValue.content}
                                    onChange={(content) => {
                                        setFormValue((v) => ({
                                            ...v,
                                            content
                                        }));
                                        if (content.trim()) {
                                            state.setFormError((errors) =>
                                                omit(errors, "content")
                                            );
                                        }
                                    }}
                                />
                                {state.formError?.content ? (
                                    <div className="image-error" role="alert">
                                        {`${state.formError.content}`}
                                    </div>
                                ) : null}
                            </Form.Group>
                        </Form>
                    </>
                )}
            </Modal.Body>
            <Modal.Footer>
                <Button
                    appearance="primary"
                    onClick={submitData.execute}
                    disabled={
                        state.loading || !!state.loadError || submitData.loading
                    }
                >
                    {isCreateForm ? "Create" : "Update"}
                </Button>
                <Button onClick={state.close} disabled={submitData.loading}>
                    Cancel
                </Button>
            </Modal.Footer>
        </Modal>
    );
};

export default forwardRef<RefType, PropsType>(StoryFormPopUp);
