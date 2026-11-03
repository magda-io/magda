import React, { FunctionComponent, useEffect, useRef, useState } from "react";
import { useAsync, useAsyncCallback } from "react-async-hook";
import Panel from "rsuite/Panel";
import Button from "rsuite/Button";
import ButtonToolbar from "rsuite/ButtonToolbar";
import Loader from "rsuite/Loader";
import { MdImage, MdFileUpload } from "react-icons/md";
import { getContentBlob, writeContent } from "api-clients/ContentApis";
import reportError from "helpers/reportError";
import humanFileSize from "helpers/humanFileSize";
import {
    FAVICON_MIME_TYPE,
    isFaviconFile,
    MAX_IMAGE_FILE_SIZE,
    SUPPORTED_IMAGE_TYPES
} from "./imageUtils";

type PropsType = {
    contentId: string;
    title: string;
    description: React.ReactNode;
    isFavicon?: boolean;
};

/**
 * Show the current image of an image content item (e.g. `header/logo`)
 * and allow uploading a replacement.
 */
const ImageSettingCard: FunctionComponent<PropsType> = ({
    contentId,
    title,
    description,
    isFavicon
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [reloadToken, setReloadToken] = useState<string>("");
    const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(
        null
    );

    const { loading } = useAsync(
        async (contentId: string, reloadToken: string) => {
            try {
                const blob = await getContentBlob(contentId);
                setCurrentImageUrl(blob ? URL.createObjectURL(blob) : null);
            } catch (e) {
                setCurrentImageUrl(null);
                reportError(`Failed to load the current image: ${e}`);
            }
        },
        [contentId, reloadToken]
    );

    // release object URLs that are no longer in use
    useEffect(
        () => () => {
            if (currentImageUrl) URL.revokeObjectURL(currentImageUrl);
        },
        [currentImageUrl]
    );
    useEffect(
        () => () => {
            if (selectedImageUrl) URL.revokeObjectURL(selectedImageUrl);
        },
        [selectedImageUrl]
    );

    const selectFile = (file: File | null) => {
        setSelectedFile(file);
        setSelectedImageUrl(file ? URL.createObjectURL(file) : null);
    };

    const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) {
            return;
        }
        if (isFavicon && !isFaviconFile(file)) {
            reportError("Please select an icon (.ico) file.");
            return;
        }
        if (!isFavicon && SUPPORTED_IMAGE_TYPES.indexOf(file.type) === -1) {
            reportError(
                "Please select a PNG, GIF, JPEG, WebP or SVG image file."
            );
            return;
        }
        if (file.size > MAX_IMAGE_FILE_SIZE) {
            reportError(
                `The file is too big (${humanFileSize(
                    file.size
                )}). The maximum size is ${humanFileSize(MAX_IMAGE_FILE_SIZE)}.`
            );
            return;
        }
        selectFile(file);
    };

    const upload = useAsyncCallback(async () => {
        if (!selectedFile) {
            return;
        }
        try {
            await writeContent(
                contentId,
                await selectedFile.arrayBuffer(),
                isFavicon ? FAVICON_MIME_TYPE : selectedFile.type
            );
            selectFile(null);
            setReloadToken(`${Math.random()}`);
        } catch (e) {
            reportError(`Failed to upload the image: ${e}`);
        }
    });

    return (
        <Panel bordered className="image-setting-card" header={title}>
            <div className="image-setting-description">{description}</div>
            <div className="image-setting-previews">
                <div className="image-setting-preview">
                    <div className="preview-label">Current</div>
                    <div
                        className={`preview-box ${
                            isFavicon ? "preview-box-icon" : ""
                        }`}
                    >
                        {loading ? (
                            <Loader center />
                        ) : currentImageUrl ? (
                            <img
                                src={currentImageUrl}
                                alt={`Current ${title}`}
                            />
                        ) : (
                            <div className="no-image">
                                <MdImage />
                                <span>Not set</span>
                            </div>
                        )}
                    </div>
                </div>
                {selectedImageUrl ? (
                    <div className="image-setting-preview">
                        <div className="preview-label">
                            New: {selectedFile?.name} (
                            {humanFileSize(selectedFile?.size)})
                        </div>
                        <div
                            className={`preview-box ${
                                isFavicon ? "preview-box-icon" : ""
                            }`}
                        >
                            <img src={selectedImageUrl} alt={`New ${title}`} />
                        </div>
                    </div>
                ) : null}
            </div>
            <input
                ref={fileInputRef}
                type="file"
                accept={
                    isFavicon
                        ? ".ico,image/x-icon,image/vnd.microsoft.icon"
                        : SUPPORTED_IMAGE_TYPES.join(",")
                }
                style={{ display: "none" }}
                onChange={onFileChange}
            />
            <ButtonToolbar>
                <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={upload.loading}
                >
                    {selectedFile ? "Select another file..." : "Select file..."}
                </Button>
                {selectedFile ? (
                    <>
                        <Button
                            appearance="primary"
                            startIcon={<MdFileUpload />}
                            loading={upload.loading}
                            onClick={upload.execute}
                        >
                            Upload
                        </Button>
                        <Button
                            appearance="subtle"
                            disabled={upload.loading}
                            onClick={() => selectFile(null)}
                        >
                            Cancel
                        </Button>
                    </>
                ) : null}
            </ButtonToolbar>
        </Panel>
    );
};

export default ImageSettingCard;
