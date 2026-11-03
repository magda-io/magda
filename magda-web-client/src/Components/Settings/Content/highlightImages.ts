import {
    computeCoverCrop,
    getHighlightImageSizes,
    HighlightImageSize
} from "./homeUtils";

const JPEG_QUALITY = 0.9;

export function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("The image can't be read."));
        img.src = src;
    });
}

/**
 * Crop (centered) & resize an image to the size, as a JPEG.
 */
export function cropAndResizeImage(
    img: HTMLImageElement,
    size: HighlightImageSize
): Promise<Blob> {
    const { sx, sy, sWidth, sHeight } = computeCoverCrop(
        img.naturalWidth,
        img.naturalHeight,
        size.width,
        size.height
    );
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return Promise.reject(new Error("Canvas is not supported."));
    }
    // JPEG has no transparency: use a white background for transparent images
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, size.width, size.height);
    return new Promise((resolve, reject) =>
        canvas.toBlob(
            (blob) =>
                blob
                    ? resolve(blob)
                    : reject(new Error("Failed to create the image.")),
            "image/jpeg",
            JPEG_QUALITY
        )
    );
}

/**
 * Create the highlight background images (one per size that the image is large enough for).
 */
export async function createHighlightImages(
    img: HTMLImageElement
): Promise<{ size: HighlightImageSize; blob: Blob }[]> {
    const sizes = getHighlightImageSizes(img.naturalWidth, img.naturalHeight);
    const images: { size: HighlightImageSize; blob: Blob }[] = [];
    for (const size of sizes) {
        images.push({ size, blob: await cropAndResizeImage(img, size) });
    }
    return images;
}
