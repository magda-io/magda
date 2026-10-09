import sortBy from "lodash/sortBy";
import {
    ContentRecord,
    HomeHighlightItem,
    HomeStoryItem
} from "api-clients/ContentApis";
import { toOrderNumber } from "./contentUtils";
import {
    HighlightCandidate,
    LOCAL_DATE_PATTERN
} from "helpers/homeHighlightRotation";

export const HOME_SETTINGS_BASE_URL = "/settings/content/home";

export const HOME_TAB_TAGLINES = "taglines";
export const HOME_TAB_HIGHLIGHTS = "highlights";
export const HOME_TAB_STORIES = "stories";
export const HOME_TABS = [
    HOME_TAB_TAGLINES,
    HOME_TAB_HIGHLIGHTS,
    HOME_TAB_STORIES
];
export type HomeTab = typeof HOME_TABS[number];

export function isHomeTab(tab: any): tab is HomeTab {
    return HOME_TABS.indexOf(tab) !== -1;
}

export const TAGLINE_DESKTOP_ID = "home/tagline/desktop";
export const TAGLINE_MOBILE_ID = "home/tagline/mobile";

export const HIGHLIGHT_ID_PREFIX = "home/highlights/";
export const HIGHLIGHT_IMAGE_ID_PREFIX = "home/highlight-images/";
export const STORY_ID_PREFIX = "home/stories/";
export const STORY_IMAGE_ID_PREFIX = "home/story-images/";

/**
 * A new id for a highlight or story: the creation time, like the legacy admin pages.
 * It keeps highlights listed in creation order.
 */
export function generateHomeItemKey(existingKeys: string[] = []): string {
    let key = Date.now();
    while (existingKeys.indexOf(`${key}`) !== -1) {
        key++;
    }
    return `${key}`;
}

/* ------------------------------------------------------------------ */
/* Highlights                                                          */
/* ------------------------------------------------------------------ */

/**
 * A size of the highlight background image.
 * The home page picks the image by screen width, parsing the width from the last segment of the
 * image id (e.g. `home/highlight-images/<id>/720w` is shown on screens from 720px wide).
 * The sizes match the built-in home page images (`assets/homepage/*.jpg`).
 */
export type HighlightImageSize = {
    // the last segment of the image id
    key: string;
    width: number;
    height: number;
    label: string;
};

export const HIGHLIGHT_IMAGE_SIZES: HighlightImageSize[] = [
    { key: "0w", width: 550, height: 978, label: "Phones" },
    { key: "720w", width: 720, height: 405, label: "Screens from 720px" },
    { key: "1080w", width: 1080, height: 677, label: "Screens from 1080px" },
    { key: "1440w", width: 1440, height: 902, label: "Screens from 1440px" },
    { key: "2160w", width: 2160, height: 1353, label: "Screens from 2160px" }
];

/** an image must be at least this size to produce the phone & smallest desktop images */
export const HIGHLIGHT_IMAGE_MIN_WIDTH = 720;
export const HIGHLIGHT_IMAGE_MIN_HEIGHT = 978;

export type CropArea = {
    sx: number;
    sy: number;
    sWidth: number;
    sHeight: number;
};

/**
 * The largest centered area of a `srcWidth` x `srcHeight` image with the aspect ratio of
 * `targetWidth` x `targetHeight` (i.e. how CSS `object-fit: cover` crops an image).
 */
export function computeCoverCrop(
    srcWidth: number,
    srcHeight: number,
    targetWidth: number,
    targetHeight: number
): CropArea {
    const targetRatio = targetWidth / targetHeight;
    if (srcWidth / srcHeight > targetRatio) {
        // the source is wider: crop the left & right
        const sWidth = Math.round(srcHeight * targetRatio);
        return {
            sx: Math.floor((srcWidth - sWidth) / 2),
            sy: 0,
            sWidth,
            sHeight: srcHeight
        };
    } else {
        // the source is taller: crop the top & bottom
        const sHeight = Math.round(srcWidth / targetRatio);
        return {
            sx: 0,
            sy: Math.floor((srcHeight - sHeight) / 2),
            sWidth: srcWidth,
            sHeight
        };
    }
}

/**
 * The image sizes that can be produced from an image without enlarging it.
 */
export function getHighlightImageSizes(
    srcWidth: number,
    srcHeight: number
): HighlightImageSize[] {
    return HIGHLIGHT_IMAGE_SIZES.filter((size) => {
        const crop = computeCoverCrop(
            srcWidth,
            srcHeight,
            size.width,
            size.height
        );
        // allow 1px for rounding
        return crop.sWidth >= size.width - 1 && crop.sHeight >= size.height - 1;
    });
}

/**
 * Check the size of a selected highlight image. Returns an error message or `undefined`.
 */
export function validateHighlightImageSize(
    width: number,
    height: number
): string | undefined {
    if (
        width < HIGHLIGHT_IMAGE_MIN_WIDTH ||
        height < HIGHLIGHT_IMAGE_MIN_HEIGHT
    ) {
        return `The image is ${width}x${height} pixels. Please select an image of at least ${HIGHLIGHT_IMAGE_MIN_WIDTH}x${HIGHLIGHT_IMAGE_MIN_HEIGHT} pixels.`;
    }
    return undefined;
}

export function highlightImageId(highlightKey: string, sizeKey: string) {
    return `${HIGHLIGHT_IMAGE_ID_PREFIX}${highlightKey}/${sizeKey}`;
}

/**
 * Parse a highlight image id `home/highlight-images/<highlightKey>/<sizeKey>`.
 */
export function parseHighlightImageId(
    id: string
): { highlightKey: string; sizeKey: string } | undefined {
    if (typeof id !== "string" || id.indexOf(HIGHLIGHT_IMAGE_ID_PREFIX) !== 0) {
        return undefined;
    }
    const rest = id.substring(HIGHLIGHT_IMAGE_ID_PREFIX.length);
    const idx = rest.lastIndexOf("/");
    if (idx <= 0 || idx === rest.length - 1) {
        return undefined;
    }
    return {
        highlightKey: rest.substring(0, idx),
        sizeKey: rest.substring(idx + 1)
    };
}

/** the width in a size key, e.g. `720w` -> 720 (parsed like the home page does) */
export function sizeKeyToWidth(sizeKey: string): number {
    const width = parseInt(sizeKey.replace(/[^\d]/g, ""), 10);
    return isNaN(width) ? 0 : width;
}

export type HighlightRecord = {
    // the highlight key, i.e. the last part of `home/highlights/<key>`
    key: string;
    // `undefined` when only the images exist
    content?: HomeHighlightItem;
    // the size keys of the existing images, sorted by width
    imageSizeKeys: string[];
};

/**
 * Group the highlight items (`home/highlights/*`) & their images (`home/highlight-images/*`).
 * Images without a highlight item are included too, as the home page still shows them.
 */
export function groupHighlights(records: ContentRecord[]): HighlightRecord[] {
    const highlights: { [key: string]: HighlightRecord } = {};
    const getHighlight = (key: string) => {
        if (!highlights[key]) {
            highlights[key] = { key, imageSizeKeys: [] };
        }
        return highlights[key];
    };
    for (const record of records) {
        if (!record?.id) {
            continue;
        }
        if (record.id.indexOf(HIGHLIGHT_ID_PREFIX) === 0) {
            const key = record.id.substring(HIGHLIGHT_ID_PREFIX.length);
            if (!key) {
                continue;
            }
            const content = record.content;
            getHighlight(key).content =
                content && typeof content === "object" ? content : {};
        } else {
            const parsed = parseHighlightImageId(record.id);
            if (parsed) {
                getHighlight(parsed.highlightKey).imageSizeKeys.push(
                    parsed.sizeKey
                );
            }
        }
    }
    // in the rotation order: by `order`, then key
    return sortBy(Object.values(highlights), [
        (item) =>
            typeof item.content?.order === "number" &&
            isFinite(item.content.order)
                ? item.content.order
                : Number.MAX_SAFE_INTEGER,
        (item) => item.key
    ]).map((item) => ({
        ...item,
        imageSizeKeys: sortBy(item.imageSizeKeys, sizeKeyToWidth)
    }));
}

/**
 * The highlights the home page can show (those with images), for `pickHighlight` & co.
 */
export function toHighlightCandidates(
    records: HighlightRecord[]
): HighlightCandidate[] {
    return records
        .filter((item) => item.imageSizeKeys.length > 0)
        .map((item) => ({
            key: item.key,
            order: item.content?.order,
            featuredUntil: item.content?.featuredUntil
        }));
}

/**
 * Pick the image to show as a thumbnail / preview: the smallest landscape image of at least
 * `minWidth`, or the largest image when none is that wide.
 */
export function pickHighlightImageSizeKey(
    imageSizeKeys: string[],
    minWidth: number = 720
): string | undefined {
    if (!imageSizeKeys?.length) {
        return undefined;
    }
    const sorted = sortBy(imageSizeKeys, sizeKeyToWidth);
    const found = sorted.find((key) => sizeKeyToWidth(key) >= minWidth);
    return found ? found : sorted[sorted.length - 1];
}

export type HighlightFormValue = {
    text: string;
    url: string;
    order: number | string;
    // not edited in the form (see the "Feature" action), but kept when the highlight is saved
    featuredUntil: string;
};

export function emptyHighlightFormValue(order: number = 1): HighlightFormValue {
    return { text: "", url: "", order, featuredUntil: "" };
}

/**
 * @param defaultOrder the order of a highlight saved with no order (it's shown after the others)
 */
export function highlightToFormValue(
    item?: HomeHighlightItem,
    defaultOrder: number = 1
): HighlightFormValue {
    return {
        text: typeof item?.text === "string" ? item.text : "",
        url: typeof item?.url === "string" ? item.url : "",
        order: typeof item?.order === "number" ? item.order : defaultOrder,
        featuredUntil:
            typeof item?.featuredUntil === "string" ? item.featuredUntil : ""
    };
}

/**
 * Convert the form values to the `home-highlight` shape. Empty fields are left out.
 */
export function formValueToHighlight(
    value: HighlightFormValue
): HomeHighlightItem {
    const item: HomeHighlightItem = { order: toOrderNumber(value?.order) };
    const text = value?.text ? value.text.trim() : "";
    const url = value?.url ? value.url.trim() : "";
    if (text) {
        item.text = text;
    }
    if (url) {
        item.url = url;
    }
    if (value?.featuredUntil && LOCAL_DATE_PATTERN.test(value.featuredUntil)) {
        item.featuredUntil = value.featuredUntil;
    }
    return item;
}

/**
 * The highlight item with `featuredUntil` set (a `YYYY-MM-DD` date) or removed (`undefined`).
 * The other fields are kept.
 */
export function setHighlightFeaturedUntil(
    item: HomeHighlightItem | undefined,
    featuredUntil: string | undefined
): HomeHighlightItem {
    const rest: HomeHighlightItem = { ...item };
    delete rest.featuredUntil;
    return featuredUntil ? { ...rest, featuredUntil } : rest;
}

/* ------------------------------------------------------------------ */
/* Stories                                                             */
/* ------------------------------------------------------------------ */

export type StoryFormValue = {
    title: string;
    titleUrl: string;
    order: number | string;
    content: string;
};

export function emptyStoryFormValue(order: number = 1): StoryFormValue {
    return { title: "", titleUrl: "", order, content: "" };
}

export function storyToFormValue(item?: HomeStoryItem): StoryFormValue {
    return {
        title: typeof item?.title === "string" ? item.title : "",
        titleUrl: typeof item?.titleUrl === "string" ? item.titleUrl : "",
        order: typeof item?.order === "number" ? item.order : 1,
        content: typeof item?.content === "string" ? item.content : ""
    };
}

/**
 * Convert the form values to the `home-story` shape.
 * An empty `titleUrl` is left out, as the schema requires it to be non-empty when present.
 */
export function formValueToStory(value: StoryFormValue): HomeStoryItem {
    const item: HomeStoryItem = {
        title: value.title.trim(),
        order: toOrderNumber(value.order),
        content: value.content
    };
    const titleUrl = value.titleUrl ? value.titleUrl.trim() : "";
    if (titleUrl) {
        item.titleUrl = titleUrl;
    }
    return item;
}

export function storyKeyFromId(storyId: string): string {
    return storyId.indexOf(STORY_ID_PREFIX) === 0
        ? storyId.substring(STORY_ID_PREFIX.length)
        : storyId;
}

export function storyImageId(storyId: string): string {
    return `${STORY_IMAGE_ID_PREFIX}${storyKeyFromId(storyId)}`;
}
