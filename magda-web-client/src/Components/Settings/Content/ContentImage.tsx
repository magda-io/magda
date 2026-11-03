import React, { FunctionComponent, useEffect, useState } from "react";
import { useAsync } from "react-async-hook";
import Loader from "rsuite/Loader";
import { MdImage } from "react-icons/md";
import { getContentBlob } from "api-clients/ContentApis";

type PropsType = {
    // the image content item id, e.g. `home/story-images/123`
    contentId?: string;
    alt: string;
    className?: string;
    // change it to reload the image
    reloadToken?: string;
    noImageText?: string;
};

/**
 * Show an image content item, loaded with no cache (so a replaced image always shows).
 */
const ContentImage: FunctionComponent<PropsType> = ({
    contentId,
    alt,
    className,
    reloadToken,
    noImageText
}) => {
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    const { loading, error } = useAsync(
        async (contentId?: string, reloadToken?: string) => {
            if (!contentId) {
                setImageUrl(null);
                return;
            }
            const blob = await getContentBlob(contentId);
            setImageUrl(blob ? URL.createObjectURL(blob) : null);
        },
        [contentId, reloadToken]
    );

    // release object URLs that are no longer in use
    useEffect(
        () => () => {
            if (imageUrl) URL.revokeObjectURL(imageUrl);
        },
        [imageUrl]
    );

    return (
        <div className={`content-image ${className ? className : ""}`}>
            {loading ? (
                <Loader size="sm" />
            ) : imageUrl && !error ? (
                <img src={imageUrl} alt={alt} />
            ) : (
                <div className="no-image">
                    <MdImage />
                    <span>
                        {error
                            ? "Failed to load"
                            : noImageText
                            ? noImageText
                            : "No image"}
                    </span>
                </div>
            )}
        </div>
    );
};

export default ContentImage;
