import {
    buildUiTextRecords,
    filterUiTextRecords,
    isUiTextModified,
    parseUiTextId,
    uiTextId,
    KNOWN_UI_TEXTS
} from "./uiTextUtils";

describe("UI text ids", () => {
    it("builds & parses ids", () => {
        expect(uiTextId("global", "appName")).toBe("lang/en/global/appName");
        expect(parseUiTextId("lang/en/global/appName")).toEqual({
            language: "en",
            namespace: "global",
            key: "appName"
        });
        expect(parseUiTextId("lang/en/global")).toBeUndefined();
        expect(parseUiTextId("lang/en//appName")).toBeUndefined();
        expect(parseUiTextId("page/about")).toBeUndefined();
    });
});

describe("buildUiTextRecords", () => {
    it("merges the stored texts with the known texts", () => {
        const items = buildUiTextRecords([
            {
                id: "lang/en/global/appName",
                type: "text/plain",
                content: "My Portal"
            },
            {
                id: "lang/en/datasetPage/accessNotesPrefix",
                type: "text/plain",
                content: ""
            },
            {
                id: "lang/en/someNamespace/someKey",
                type: "text/plain",
                content: "Other"
            },
            // other languages are ignored
            { id: "lang/fr/global/appName", type: "text/plain", content: "X" }
        ]);
        expect(items.length).toBe(Object.keys(KNOWN_UI_TEXTS).length + 1);

        const appName = items.find((item) => item.id.endsWith("/appName"));
        expect(appName?.value).toBe("My Portal");
        expect(appName?.defaultValue).toBe("Magda");
        expect(appName && isUiTextModified(appName)).toBe(true);

        // empty strings are valid values
        const prefix = items.find((item) =>
            item.id.endsWith("/accessNotesPrefix")
        );
        expect(prefix?.value).toBe("");
        expect(prefix && isUiTextModified(prefix)).toBe(false);

        // known texts that aren't stored
        const title = items.find(
            (item) => item.id === "lang/en/publishersPage/publishersPageTitle"
        );
        expect(title?.value).toBeUndefined();
        expect(title && isUiTextModified(title)).toBe(false);

        // unknown stored texts
        const other = items.find((item) => item.namespace === "someNamespace");
        expect(other).toEqual({
            id: "lang/en/someNamespace/someKey",
            namespace: "someNamespace",
            key: "someKey",
            value: "Other"
        });
        expect(other && isUiTextModified(other)).toBe(false);

        // sorted by namespace & key
        const sortKeys = items.map((item) => `${item.namespace}/${item.key}`);
        expect(sortKeys).toEqual([...sortKeys].sort());
    });
});

describe("filterUiTextRecords", () => {
    it("filters by namespace, key, value or description", () => {
        const items = buildUiTextRecords([
            {
                id: "lang/en/global/appName",
                type: "text/plain",
                content: "My Portal"
            }
        ]);
        expect(filterUiTextRecords(items, "").length).toBe(items.length);
        expect(
            filterUiTextRecords(items, "my portal").map((item) => item.key)
        ).toEqual(["appName"]);
        expect(
            filterUiTextRecords(items, "DATASETPAGE").map((item) => item.key)
        ).toEqual([
            "accessNotesPrefix",
            "accessNotesSuffix",
            "contactPointTitle"
        ]);
        expect(
            filterUiTextRecords(items, "search box").map((item) => item.key)
        ).toEqual(["publishersSearchPlaceholder"]);
    });
});
