import createHighlightFormModel from "./highlightFormModel";

describe("highlight form model", () => {
    const check = (text: string, url: string) => {
        const result = createHighlightFormModel().check({
            text,
            url,
            order: 1,
            featuredUntil: ""
        });
        return {
            text: result.text.hasError ? result.text.errorMessage : undefined,
            url: result.url.hasError ? result.url.errorMessage : undefined
        };
    };

    it("allows no link", () => {
        expect(check("", "")).toEqual({ text: undefined, url: undefined });
    });

    it("requires both the text & the URL", () => {
        expect(check("Explore", "").url).toMatch(/link URL too/);
        expect(check("", "/page/about").text).toMatch(/link text too/);
        expect(check("Explore", "/page/about")).toEqual({
            text: undefined,
            url: undefined
        });
        expect(check("Explore", "https://example.com").url).toBeUndefined();
    });

    it("requires a number order", () => {
        const check = (order: any) =>
            createHighlightFormModel().check({
                text: "",
                url: "",
                order,
                featuredUntil: ""
            }).order.hasError;
        expect(check(2)).toBe(false);
        expect(check("2.5")).toBe(false);
        expect(check("")).toBe(true);
        expect(check("abc")).toBe(true);
    });

    it("validates the URL", () => {
        expect(check("Explore", "page/about").url).toMatch(/site path/);
        expect(check("Explore", "/a b").url).toMatch(/site path/);
    });
});
