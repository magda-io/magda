import {
    computeCoverCrop,
    emptyHighlightFormValue,
    emptyStoryFormValue,
    formValueToHighlight,
    formValueToStory,
    generateHomeItemKey,
    getHighlightImageSizes,
    groupHighlights,
    highlightImageId,
    highlightToFormValue,
    isHomeTab,
    parseHighlightImageId,
    pickHighlightImageSizeKey,
    setHighlightFeaturedUntil,
    sizeKeyToWidth,
    storyImageId,
    storyToFormValue,
    toHighlightCandidates,
    validateHighlightImageSize,
    HIGHLIGHT_IMAGE_SIZES
} from "./homeUtils";

describe("home tabs", () => {
    it("recognises the tabs", () => {
        expect(isHomeTab("taglines")).toBe(true);
        expect(isHomeTab("highlights")).toBe(true);
        expect(isHomeTab("stories")).toBe(true);
        expect(isHomeTab("logos")).toBe(false);
        expect(isHomeTab(undefined)).toBe(false);
    });
});

describe("generateHomeItemKey", () => {
    it("avoids existing keys", () => {
        const key = generateHomeItemKey();
        expect(key).toMatch(/^\d+$/);
        const next = generateHomeItemKey([key, `${parseInt(key, 10) + 1}`]);
        expect(next).not.toBe(key);
        expect(next).not.toBe(`${parseInt(key, 10) + 1}`);
    });
});

describe("highlight images", () => {
    it("uses the size key names the home page parses", () => {
        expect(HIGHLIGHT_IMAGE_SIZES.map((size) => size.key)).toEqual([
            "0w",
            "720w",
            "1080w",
            "1440w",
            "2160w"
        ]);
        expect(
            HIGHLIGHT_IMAGE_SIZES.map((size) => sizeKeyToWidth(size.key))
        ).toEqual([0, 720, 1080, 1440, 2160]);
    });

    it("crops a wider image at the left & right, keeping the aspect ratio", () => {
        // 2000x1000 to 720x405 (16:9): 1778x1000 centered
        expect(computeCoverCrop(2000, 1000, 720, 405)).toEqual({
            sx: 111,
            sy: 0,
            sWidth: 1778,
            sHeight: 1000
        });
    });

    it("crops a taller image at the top & bottom, keeping the aspect ratio", () => {
        // 720x978 to 720x405
        expect(computeCoverCrop(720, 978, 720, 405)).toEqual({
            sx: 0,
            sy: 286,
            sWidth: 720,
            sHeight: 405
        });
        // 720x978 to the 550x978 phone image
        expect(computeCoverCrop(720, 978, 550, 978)).toEqual({
            sx: 85,
            sy: 0,
            sWidth: 550,
            sHeight: 978
        });
    });

    it("only produces the sizes an image is large enough for", () => {
        expect(getHighlightImageSizes(720, 978).map((s) => s.key)).toEqual([
            "0w",
            "720w"
        ]);
        expect(getHighlightImageSizes(1600, 1000).map((s) => s.key)).toEqual([
            "0w",
            "720w",
            "1080w",
            "1440w"
        ]);
        expect(getHighlightImageSizes(4000, 3000).map((s) => s.key)).toEqual([
            "0w",
            "720w",
            "1080w",
            "1440w",
            "2160w"
        ]);
        // too short for the phone & 1440px (902px high) images
        expect(getHighlightImageSizes(3000, 900).map((s) => s.key)).toEqual([
            "720w",
            "1080w"
        ]);
    });

    it("validates the minimum size", () => {
        expect(validateHighlightImageSize(720, 978)).toBeUndefined();
        expect(validateHighlightImageSize(719, 2000)).toMatch(/720x978/);
        expect(validateHighlightImageSize(2000, 977)).toMatch(/2000x977/);
    });

    it("builds & parses image ids", () => {
        const id = highlightImageId("1700000000000", "720w");
        expect(id).toBe("home/highlight-images/1700000000000/720w");
        expect(parseHighlightImageId(id)).toEqual({
            highlightKey: "1700000000000",
            sizeKey: "720w"
        });
        expect(parseHighlightImageId("home/highlights/1")).toBeUndefined();
        expect(
            parseHighlightImageId("home/highlight-images/1")
        ).toBeUndefined();
        expect(
            parseHighlightImageId("home/highlight-images/1/")
        ).toBeUndefined();
    });

    it("picks the thumbnail image", () => {
        expect(pickHighlightImageSizeKey([])).toBeUndefined();
        expect(
            pickHighlightImageSizeKey(["1440w", "0w", "720w", "1080w"])
        ).toBe("720w");
        expect(pickHighlightImageSizeKey(["0w", "720w", "1080w"], 1440)).toBe(
            "1080w"
        );
        expect(pickHighlightImageSizeKey(["0w"])).toBe("0w");
    });
});

describe("groupHighlights", () => {
    it("groups the highlights & their images, including images with no highlight item", () => {
        const records = [
            {
                id: "home/highlight-images/2/1080w",
                type: "image/jpeg"
            },
            {
                id: "home/highlights/1",
                type: "application/json",
                content: { text: "Hello", url: "/page/hello" }
            },
            { id: "home/highlight-images/1/720w", type: "image/jpeg" },
            { id: "home/highlight-images/1/0w", type: "image/jpeg" },
            { id: "home/highlight-images/1/1080w", type: "image/jpeg" },
            { id: "home/highlights/3", type: "application/json" }
        ];
        expect(groupHighlights(records)).toEqual([
            {
                key: "1",
                content: { text: "Hello", url: "/page/hello" },
                imageSizeKeys: ["0w", "720w", "1080w"]
            },
            { key: "2", imageSizeKeys: ["1080w"] },
            { key: "3", content: {}, imageSizeKeys: [] }
        ]);
    });

    it("sorts in the rotation order & lists the candidates with images", () => {
        const records = groupHighlights([
            {
                id: "home/highlights/1",
                type: "application/json",
                content: { order: 2 }
            },
            {
                id: "home/highlights/2",
                type: "application/json",
                content: { order: 1, featuredUntil: "2026-10-08" }
            },
            { id: "home/highlights/3", type: "application/json" },
            { id: "home/highlight-images/1/720w", type: "image/jpeg" },
            { id: "home/highlight-images/2/720w", type: "image/jpeg" },
            { id: "home/highlight-images/4/720w", type: "image/jpeg" }
        ]);
        expect(records.map((item) => item.key)).toEqual(["2", "1", "3", "4"]);
        expect(toHighlightCandidates(records)).toEqual([
            { key: "2", order: 1, featuredUntil: "2026-10-08" },
            { key: "1", order: 2, featuredUntil: undefined },
            { key: "4", order: undefined, featuredUntil: undefined }
        ]);
    });
});

describe("highlight items", () => {
    it("converts to form values and back", () => {
        expect(highlightToFormValue(undefined)).toEqual(
            emptyHighlightFormValue(1)
        );
        const item = {
            text: "Hi",
            url: "/x",
            order: 3,
            featuredUntil: "2026-10-08"
        };
        const value = highlightToFormValue(item);
        expect(value).toEqual(item);
        expect(formValueToHighlight(value)).toEqual(item);
    });

    it("leaves out empty fields & invalid dates", () => {
        expect(
            formValueToHighlight({
                text: "  ",
                url: "",
                order: "2",
                featuredUntil: ""
            })
        ).toEqual({ order: 2 });
        expect(
            formValueToHighlight({
                text: " Hi ",
                url: " /x ",
                order: 1,
                featuredUntil: "8/10/2026"
            })
        ).toEqual({ text: "Hi", url: "/x", order: 1 });
    });

    it("sets & removes featuredUntil, keeping the other fields", () => {
        const item = { text: "Hi", url: "/x", order: 2 };
        expect(setHighlightFeaturedUntil(item, "2026-10-08")).toEqual({
            ...item,
            featuredUntil: "2026-10-08"
        });
        expect(
            setHighlightFeaturedUntil(
                { ...item, featuredUntil: "2026-10-08" },
                undefined
            )
        ).toEqual(item);
        // an image-only highlight has no item yet
        expect(setHighlightFeaturedUntil(undefined, "2026-10-08")).toEqual({
            featuredUntil: "2026-10-08"
        });
    });
});

describe("stories", () => {
    it("converts a story to form values and back", () => {
        const story = {
            title: "A story",
            titleUrl: "https://example.com",
            order: 2,
            content: "Some **markdown**"
        };
        const value = storyToFormValue(story);
        expect(value).toEqual(story);
        expect(formValueToStory(value)).toEqual(story);
    });

    it("leaves out an empty title URL & trims the title", () => {
        expect(
            formValueToStory({
                title: " A story ",
                titleUrl: " ",
                order: "3",
                content: "text"
            })
        ).toEqual({ title: "A story", order: 3, content: "text" });
    });

    it("creates empty form values with the next order", () => {
        expect(emptyStoryFormValue(5)).toEqual({
            title: "",
            titleUrl: "",
            order: 5,
            content: ""
        });
        expect(storyToFormValue(undefined)).toEqual(emptyStoryFormValue(1));
    });

    it("works out the story image id", () => {
        expect(storyImageId("home/stories/123")).toBe("home/story-images/123");
    });
});
