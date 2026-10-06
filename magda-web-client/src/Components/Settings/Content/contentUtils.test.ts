import {
    computeMoveOrderUpdates,
    emptyHeaderNavigationFormValue,
    formValueToFooterCopyright,
    formValueToHeaderNavigation,
    formValueToLink,
    formValueToPage,
    getNextOrder,
    headerNavigationToFormValue,
    isValidHeaderHref,
    isValidOrder,
    linkToFormValue,
    parseRel,
    sortByOrder,
    validatePageSlug,
    HEADER_ITEM_TYPE_AUTH,
    HEADER_ITEM_TYPE_LINK
} from "./contentUtils";

describe("header navigation items", () => {
    it("converts a regular link to form values and back", () => {
        const item = {
            order: 3,
            default: {
                label: "About",
                href: "/page/about",
                rel: "noopener noreferrer",
                target: "_blank"
            }
        };
        const formValue = headerNavigationToFormValue(item);
        expect(formValue).toEqual({
            itemType: HEADER_ITEM_TYPE_LINK,
            order: 3,
            label: "About",
            href: "/page/about",
            rel: ["noopener", "noreferrer"],
            openInNewWindow: true,
            target: "_blank"
        });
        expect(formValueToHeaderNavigation(formValue)).toEqual(item);
    });

    it("saves the authentication menu as `{ order, auth: {} }`", () => {
        const formValue = headerNavigationToFormValue({ order: 5, auth: {} });
        expect(formValue.itemType).toBe(HEADER_ITEM_TYPE_AUTH);
        expect(
            formValueToHeaderNavigation({ ...formValue, label: "ignored" })
        ).toEqual({ order: 5, auth: {} });
    });

    it("leaves out empty rel & target and trims values", () => {
        expect(
            formValueToHeaderNavigation({
                ...emptyHeaderNavigationFormValue(),
                order: "2",
                label: " Data ",
                href: " /search ",
                rel: [],
                openInNewWindow: false,
                target: "_blank"
            })
        ).toEqual({ order: 2, default: { label: "Data", href: "/search" } });
    });

    it("defaults target to `_blank` when opening in a new window", () => {
        expect(
            formValueToLink({
                label: "a",
                href: "/a",
                rel: [" "],
                openInNewWindow: true,
                target: " "
            })
        ).toEqual({ label: "a", href: "/a", target: "_blank" });
    });

    it("de-duplicates rel values", () => {
        expect(
            formValueToLink({
                ...linkToFormValue(),
                label: "a",
                href: "/a",
                rel: ["noopener", "noopener noreferrer"]
            }).rel
        ).toBe("noopener noreferrer");
        expect(parseRel("  a  b a ")).toEqual(["a", "b"]);
        expect(parseRel(undefined)).toEqual([]);
    });

    it("validates header link URLs", () => {
        expect(isValidHeaderHref("/")).toBe(true);
        expect(isValidHeaderHref("/page/about?x=1")).toBe(true);
        expect(isValidHeaderHref("https://example.com/a")).toBe(true);
        expect(isValidHeaderHref("mailto:test@example.com")).toBe(true);
        expect(isValidHeaderHref("")).toBe(false);
        expect(isValidHeaderHref("page/about")).toBe(false);
        expect(isValidHeaderHref("/a b")).toBe(false);
        expect(isValidHeaderHref("https://")).toBe(false);
    });
});

describe("order helpers", () => {
    it("validates order values", () => {
        expect(isValidOrder(1)).toBe(true);
        expect(isValidOrder("12")).toBe(true);
        expect(isValidOrder("-1.5")).toBe(true);
        expect(isValidOrder("")).toBe(false);
        expect(isValidOrder("abc")).toBe(false);
        expect(isValidOrder(NaN)).toBe(false);
    });

    it("calculates the next order", () => {
        expect(getNextOrder([])).toBe(1);
        expect(
            getNextOrder([
                { id: "a", type: "", content: { order: 3 } },
                { id: "b", type: "", content: { order: 10.5 } },
                { id: "c", type: "", content: {} }
            ])
        ).toBe(11);
    });

    it("sorts by order then id", () => {
        const sorted = sortByOrder([
            { id: "c", type: "", content: { order: 2 } },
            { id: "b", type: "", content: { order: 1 } },
            { id: "a", type: "", content: { order: 2 } },
            { id: "d", type: "", content: {} }
        ]);
        expect(sorted.map((item) => item.id)).toEqual(["b", "a", "c", "d"]);
    });

    const items = (orders: number[]) =>
        orders.map((order, idx) => ({
            id: `item${idx}`,
            type: "application/json",
            content: { order }
        }));

    it("swaps the orders of two items when all orders are distinct", () => {
        expect(computeMoveOrderUpdates(items([1, 5, 10]), 1, -1)).toEqual([
            { id: "item1", order: 1 },
            { id: "item0", order: 5 }
        ]);
        expect(computeMoveOrderUpdates(items([1, 5, 10]), 1, 1)).toEqual([
            { id: "item1", order: 10 },
            { id: "item2", order: 5 }
        ]);
    });

    it("renumbers the list when orders are not distinct", () => {
        // only items whose order changes are included
        expect(computeMoveOrderUpdates(items([1, 1, 1]), 2, -1)).toEqual([
            { id: "item2", order: 2 },
            { id: "item1", order: 3 }
        ]);
        expect(computeMoveOrderUpdates(items([1, 2, 2]), 0, 1)).toEqual([
            { id: "item1", order: 1 },
            { id: "item0", order: 2 },
            { id: "item2", order: 3 }
        ]);
    });

    it("ignores moves past either end of the list", () => {
        expect(computeMoveOrderUpdates(items([1, 2]), 0, -1)).toEqual([]);
        expect(computeMoveOrderUpdates(items([1, 2]), 1, 1)).toEqual([]);
    });
});

describe("pages", () => {
    it("validates page slugs", () => {
        expect(validatePageSlug("about")).toBeUndefined();
        expect(validatePageSlug("data_quality-2")).toBeUndefined();
        expect(validatePageSlug("")).toBeTruthy();
        expect(validatePageSlug("About")).toBeTruthy();
        expect(validatePageSlug("/about")).toBeTruthy();
        expect(validatePageSlug("about-")).toBeTruthy();
        expect(validatePageSlug("a.b")).toBeTruthy();
        expect(validatePageSlug("about", ["about"])).toMatch(/already exists/);
    });

    it("leaves out empty page content", () => {
        expect(formValueToPage(" Title ", "  ")).toEqual({ title: "Title" });
        expect(formValueToPage("Title", "# hi")).toEqual({
            title: "Title",
            content: "# hi"
        });
    });
});

describe("footer copyright", () => {
    it("always saves logoClassName & logoAlt as strings", () => {
        expect(
            formValueToFooterCopyright({
                order: "1",
                href: " https://example.com ",
                logoSrc: "data:image/png;base64,AAA",
                logoAlt: "",
                logoClassName: "",
                htmlContent: "<b>hi</b>"
            })
        ).toEqual({
            order: 1,
            href: "https://example.com",
            logoSrc: "data:image/png;base64,AAA",
            logoAlt: "",
            logoClassName: "",
            htmlContent: "<b>hi</b>"
        });
    });
});
