import React, {
    forwardRef,
    ForwardRefRenderFunction,
    useEffect,
    useImperativeHandle,
    useRef,
    useState
} from "react";
import { useAsyncCallback } from "react-async-hook";
import Modal from "rsuite/Modal";
import Button from "rsuite/Button";
import Form, { FormInstance } from "rsuite/Form";
import Loader from "rsuite/Loader";
import Message from "rsuite/Message";
import Placeholder from "rsuite/Placeholder";
import Tag from "rsuite/Tag";
import TagGroup from "rsuite/TagGroup";
import { MdComputer, MdImage, MdSmartphone } from "react-icons/md";
import {
    deleteContent,
    HomeHighlightItem,
    writeContent
} from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import useContentFormState from "./useContentFormState";
import ContentImage from "./ContentImage";
import createHighlightFormModel from "./highlightFormModel";
import {
    formValueToHighlight,
    generateHomeItemKey,
    getHighlightImageSizes,
    highlightImageId,
    highlightToFormValue,
    HighlightFormValue,
    HighlightImageSize,
    HIGHLIGHT_ID_PREFIX,
    HIGHLIGHT_IMAGE_MIN_HEIGHT,
    HIGHLIGHT_IMAGE_MIN_WIDTH,
    pickHighlightImageSizeKey,
    validateHighlightImageSize
} from "./homeUtils";
import { createHighlightImages, loadImage } from "./highlightImages";

// SVG images may have no intrinsic size, so they can't be cropped reliably
const HIGHLIGHT_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
];

type PropsType = object;

export type RefType = {
    open: (
        highlightKey: string | undefined,
        options: {
            // whether the highlight item exists (only its images might exist)
            hasContent?: boolean;
            imageSizeKeys?: string[];
            existingKeys: string[];
            onComplete?: (id: string) => void;
        }
    ) => void;
};

const emptyFormValue = (): HighlightFormValue => highlightToFormValue();

const model = createHighlightFormModel();

type SelectedImage = {
    file: File;
    url: string;
    image: HTMLImageElement;
    sizes: HighlightImageSize[];
};

const HighlightFormPopUp: ForwardRefRenderFunction<RefType, PropsType> = (
    props,
    ref
) => {
    const formRef = useRef<FormInstance>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [highlightKey, setHighlightKey] = useState<string>();
    const [existingKeys, setExistingKeys] = useState<string[]>([]);
    const [imageSizeKeys, setImageSizeKeys] = useState<string[]>([]);
    const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(
        null
    );
    const [imageError, setImageError] = useState<string>("");
    const [progress, setProgress] = useState<string>("");

    const state = useContentFormState<HomeHighlightItem, HighlightFormValue>(
        highlightToFormValue,
        emptyFormValue()
    );
    const { formValue, setFormValue } = state;
    const isCreateForm = !highlightKey;

    // release the object URL of the selected image when it's no longer in use
    useEffect(
        () => () => {
            if (selectedImage?.url) URL.revokeObjectURL(selectedImage.url);
        },
        [selectedImage]
    );

    useImperativeHandle(ref, () => ({
        open: (key, options) => {
            setHighlightKey(key);
            setExistingKeys(options.existingKeys);
            setImageSizeKeys(
                options.imageSizeKeys?.length ? options.imageSizeKeys : []
            );
            setSelectedImage(null);
            setImageError("");
            setProgress("");
            state.open(
                key && options.hasContent
                    ? `${HIGHLIGHT_ID_PREFIX}${key}`
                    : undefined,
                {
                    initialValue: emptyFormValue(),
                    onComplete: options.onComplete
                }
            );
        }
    }));

    const onSelectFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) {
            return;
        }
        if (HIGHLIGHT_IMAGE_TYPES.indexOf(file.type) === -1) {
            setImageError("Please select a JPEG, PNG, WebP or GIF image file.");
            return;
        }
        const url = URL.createObjectURL(file);
        try {
            const image = await loadImage(url);
            const sizeError = validateHighlightImageSize(
                image.naturalWidth,
                image.naturalHeight
            );
            if (sizeError) {
                URL.revokeObjectURL(url);
                setImageError(sizeError);
                return;
            }
            setSelectedImage({
                file,
                url,
                image,
                sizes: getHighlightImageSizes(
                    image.naturalWidth,
                    image.naturalHeight
                )
            });
            setImageError("");
        } catch (e) {
            URL.revokeObjectURL(url);
            setImageError(`Failed to read the image file: ${e}`);
        }
    };

    const submitData = useAsyncCallback(async () => {
        const isFormValid = !!formRef.current?.check();
        if (isCreateForm && !selectedImage) {
            setImageError("Please select a background image.");
            return;
        }
        if (!isFormValid) {
            return;
        }
        const key = highlightKey
            ? highlightKey
            : generateHomeItemKey(existingKeys);
        try {
            if (selectedImage) {
                setProgress("Creating images...");
                const images = await createHighlightImages(selectedImage.image);
                for (let i = 0; i < images.length; i++) {
                    setProgress(
                        `Uploading images (${i + 1} / ${images.length})...`
                    );
                    await writeContent(
                        highlightImageId(key, images[i].size.key),
                        images[i].blob,
                        "image/jpeg"
                    );
                }
                // remove the previous images of sizes that were not replaced
                const newSizeKeys = images.map((item) => item.size.key);
                for (const sizeKey of imageSizeKeys) {
                    if (newSizeKeys.indexOf(sizeKey) === -1) {
                        await deleteContent(highlightImageId(key, sizeKey));
                    }
                }
            }
            setProgress("Saving highlight...");
            await writeContent(
                `${HIGHLIGHT_ID_PREFIX}${key}`,
                formValueToHighlight(formValue)
            );
            state.complete(key);
        } catch (e) {
            reportError(
                `Failed to ${
                    isCreateForm ? "create" : "update"
                } the highlight: ${e}`
            );
        } finally {
            setProgress("");
        }
    });

    const lozengeText = formValue.text.trim();
    const showLozenge = !!lozengeText && !!formValue.url.trim();
    const desktopSizeKey = pickHighlightImageSizeKey(imageSizeKeys, 1080);
    const phoneSizeKey =
        imageSizeKeys.indexOf("0w") !== -1
            ? "0w"
            : pickHighlightImageSizeKey(imageSizeKeys, 0);

    const renderPreview = (
        className: string,
        label: React.ReactNode,
        storedSizeKey: string | undefined,
        withLozenge: boolean
    ) => (
        <div className={`highlight-preview ${className}`}>
            <div className="preview-label">{label}</div>
            <div className="highlight-preview-box">
                {selectedImage ? (
                    <img src={selectedImage.url} alt="New background" />
                ) : highlightKey && storedSizeKey ? (
                    <ContentImage
                        contentId={highlightImageId(
                            highlightKey,
                            storedSizeKey
                        )}
                        alt="Current background"
                    />
                ) : (
                    <div className="no-image">
                        <MdImage />
                        <span>No image</span>
                    </div>
                )}
                {withLozenge && showLozenge ? (
                    <div className="highlight-preview-lozenge">
                        <span>{lozengeText}</span>
                    </div>
                ) : null}
            </div>
        </div>
    );

    return (
        <Modal
            className="content-settings-form-popup highlight-form-popup"
            backdrop="static"
            keyboard={false}
            open={state.isOpen}
            size="lg"
            overflow={true}
            onClose={state.close}
        >
            <Modal.Header>
                <Modal.Title>
                    {isCreateForm ? "Add Highlight" : "Update Highlight"}
                </Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {state.loading ? (
                    <Placeholder.Paragraph rows={8}>
                        <Loader center content="loading" />
                    </Placeholder.Paragraph>
                ) : state.loadError ? (
                    <Message showIcon type="error" header="Error">
                        Failed to retrieve the highlight: {`${state.loadError}`}
                    </Message>
                ) : (
                    <>
                        {submitData.loading ? (
                            <Loader
                                backdrop
                                content={
                                    progress ? progress : "Saving highlight..."
                                }
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
                                    ...(v as Partial<HighlightFormValue>)
                                })
                            }
                            onCheck={state.setFormError}
                        >
                            <Form.Group controlId="ctrl-image">
                                <Form.ControlLabel>
                                    Background image
                                </Form.ControlLabel>
                                <div className="highlight-image-select">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept={HIGHLIGHT_IMAGE_TYPES.join(",")}
                                        style={{ display: "none" }}
                                        onChange={onSelectFile}
                                    />
                                    <Button
                                        onClick={() =>
                                            fileInputRef.current?.click()
                                        }
                                    >
                                        {selectedImage
                                            ? "Select another image..."
                                            : isCreateForm
                                            ? "Select image..."
                                            : "Replace image..."}
                                    </Button>
                                    {selectedImage ? (
                                        <>
                                            <span className="selected-file-name">
                                                {selectedImage.file.name} (
                                                {
                                                    selectedImage.image
                                                        .naturalWidth
                                                }
                                                x
                                                {
                                                    selectedImage.image
                                                        .naturalHeight
                                                }
                                                )
                                            </span>
                                            {isCreateForm ? null : (
                                                <Button
                                                    appearance="subtle"
                                                    onClick={() =>
                                                        setSelectedImage(null)
                                                    }
                                                >
                                                    Keep the current image
                                                </Button>
                                            )}
                                        </>
                                    ) : null}
                                </div>
                                {imageError ? (
                                    <div className="image-error" role="alert">
                                        {imageError}
                                    </div>
                                ) : null}
                                <Form.HelpText>
                                    A JPEG, PNG, WebP or GIF image of at least{" "}
                                    {HIGHLIGHT_IMAGE_MIN_WIDTH}x
                                    {HIGHLIGHT_IMAGE_MIN_HEIGHT} pixels. It's
                                    cropped (centered) and resized to an image
                                    for phones and an image for each larger
                                    screen size it's big enough for, up to
                                    2160px wide.
                                </Form.HelpText>
                                <TagGroup className="highlight-image-sizes">
                                    {(selectedImage
                                        ? selectedImage.sizes.map(
                                              (size) =>
                                                  `${size.width}x${size.height}`
                                          )
                                        : imageSizeKeys
                                    ).map((label) => (
                                        <Tag key={label} size="sm">
                                            {label}
                                        </Tag>
                                    ))}
                                </TagGroup>
                            </Form.Group>
                            <div className="highlight-previews">
                                {renderPreview(
                                    "highlight-preview-desktop",
                                    <>
                                        <MdComputer /> Larger screens
                                    </>,
                                    desktopSizeKey,
                                    true
                                )}
                                {renderPreview(
                                    "highlight-preview-phone",
                                    <>
                                        <MdSmartphone /> Phones
                                    </>,
                                    phoneSizeKey,
                                    false
                                )}
                            </div>
                            <Form.Group controlId="ctrl-text">
                                <Form.ControlLabel>Link text</Form.ControlLabel>
                                <Form.Control
                                    name="text"
                                    placeholder="Optional: e.g. Explore the water data"
                                />
                            </Form.Group>
                            <Form.Group controlId="ctrl-url">
                                <Form.ControlLabel>Link URL</Form.ControlLabel>
                                <Form.Control
                                    name="url"
                                    placeholder="Optional: e.g. /search?q=water or https://example.com"
                                />
                                <Form.HelpText>
                                    The link is shown below the desktop tagline
                                    on larger screens when both the text and the
                                    URL are set. For a page of this site, enter
                                    the path only, e.g. /page/about.
                                </Form.HelpText>
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

export default forwardRef<RefType, PropsType>(HighlightFormPopUp);
