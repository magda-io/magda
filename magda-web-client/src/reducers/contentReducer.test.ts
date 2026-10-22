import contentReducer from "./contentReducer";
import { actionTypes } from "../constants/ActionTypes";

jest.mock("../config", () => ({
    config: { contentApiBaseUrl: "/api/v0/content/" },
    defaultConfiguration: {}
}));

const receiveContent = (content: any[]) =>
    contentReducer(undefined, {
        type: actionTypes.RECEIVE_CONTENT,
        content,
        error: undefined as any
    });

const footerContent = (size: "medium" | "small") => [
    {
        id: `footer/navigation/${size}/category/b`,
        content: { order: 20, label: "Second" }
    },
    {
        id: `footer/navigation/${size}/category-links/b/1`,
        content: { order: 1, label: "Second link", href: "/b" }
    },
    {
        id: `footer/navigation/${size}/category/c`,
        content: { order: 30, label: "Third" }
    },
    {
        id: `footer/navigation/${size}/category-links/c/1`,
        content: { order: 1, label: "Third link", href: "/c" }
    },
    {
        id: `footer/navigation/${size}/category/a`,
        content: { order: 10, label: "First" }
    },
    {
        id: `footer/navigation/${size}/category-links/a/2`,
        content: { order: 2, label: "First link 2", href: "/a2" }
    },
    {
        id: `footer/navigation/${size}/category-links/a/1`,
        content: { order: 1, label: "First link 1", href: "/a1" }
    }
];

describe("contentReducer footer navigation", () => {
    it("sorts desktop footer categories & their links by order", () => {
        const state = receiveContent(footerContent("medium"));
        expect(state.footerMediumNavs.map((cat) => cat.label)).toEqual([
            "First",
            "Second",
            "Third"
        ]);
        expect(
            state.footerMediumNavs[0].links.map((link) => link.label)
        ).toEqual(["First link 1", "First link 2"]);
    });

    it("sorts mobile footer categories by order", () => {
        const state = receiveContent(footerContent("small"));
        expect(state.footerSmallNavs.map((cat) => cat.label)).toEqual([
            "First",
            "Second",
            "Third"
        ]);
    });
});
