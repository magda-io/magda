import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import openApiDictionary from "@magda/registry-aspects/examples/data-dictionary/openapi-request-response.json";
import openApiContract from "@magda/registry-aspects/examples/distribution-contract/openapi-rest-query.json";
import { parseDistribution } from "helpers/record";
import DataUnderstandingTabs from "./DataUnderstandingTabs";

// Ensure the components and `react-dom` share one React instance (hooks need
// it) whichever node_modules layout the workspace install produced.
jest.mock("react", () =>
    jest.requireActual(
        require.resolve("react", {
            paths: [require.resolve("react-dom")]
        })
    )
);

jest.mock("config", () => ({
    config: {},
    DATASETS_BUCKET: "magda-datasets"
}));

let container: HTMLDivElement;
let root: Root;

function render(aspects: Record<string, any>) {
    const distribution = parseDistribution({
        id: "dist-1",
        name: "Occurrence API",
        aspects: {
            "dcat-distribution-strings": { format: "API" },
            ...aspects
        }
    } as any);
    act(() => {
        root.render(<DataUnderstandingTabs distribution={distribution} />);
    });
}

const both = {
    "data-dictionary": openApiDictionary,
    "distribution-contract": openApiContract
};

function tabs() {
    return Array.from(
        container.querySelectorAll<HTMLButtonElement>(
            '.data-understanding__tabs [role="tab"]'
        )
    );
}

function tabLabels() {
    return tabs().map((tab) => tab.textContent);
}

function selectedTab() {
    return tabs().find((tab) => tab.getAttribute("aria-selected") === "true")
        ?.textContent;
}

function panel(id: string) {
    return container.querySelector<HTMLElement>(
        `#data-understanding-panel-${id}`
    );
}

function visiblePanels() {
    return Array.from(
        container.querySelectorAll<HTMLElement>(".data-understanding__panel")
    )
        .filter((item) => !item.hidden)
        .map((item) => item.id);
}

function click(element: HTMLElement) {
    act(() => element.click());
}

function key(element: HTMLElement, keyName: string) {
    act(() => {
        element.dispatchEvent(
            new KeyboardEvent("keydown", { key: keyName, bubbles: true })
        );
    });
}

function search(text: string) {
    const input = container.querySelector<HTMLInputElement>(
        '.data-dictionary input[type="search"]'
    )!;
    act(() => {
        const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
        )!.set!;
        setter.call(input, text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    window.history.replaceState(
        null,
        "",
        "/dataset/ds-1/distribution/dist-1/details?q=x"
    );
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
});

describe("DataUnderstandingTabs", () => {
    it("renders nothing without either aspect", () => {
        render({});
        expect(container.innerHTML).toBe("");
    });

    it("shows a tab bar even for a single section", () => {
        render({ "distribution-contract": openApiContract });
        expect(tabLabels()).toEqual(["How to use"]);
        expect(selectedTab()).toBe("How to use");
        expect(visiblePanels()).toEqual([
            "data-understanding-panel-how-to-use"
        ]);

        render({ "data-dictionary": openApiDictionary });
        expect(tabLabels()).toEqual(["Structure"]);
        expect(visiblePanels()).toEqual(["data-understanding-panel-structure"]);
    });

    it("names panels by their tab instead of a visible section heading", () => {
        render(both);
        ["structure", "how-to-use"].forEach((id) => {
            const heading = panel(id)!.querySelector("h3")!;
            expect(heading.className).toBe("data-understanding__panel-heading");
            expect(heading.classList.contains("section-heading")).toBe(false);
            expect(panel(id)!.getAttribute("aria-labelledby")).toBe(
                `data-understanding-tab-${id}`
            );
        });
        expect(panel("structure")!.querySelector("h3")!.textContent).toBe(
            "Structure"
        );
        expect(panel("how-to-use")!.querySelector("h3")!.textContent).toBe(
            "How to use"
        );
    });

    it("selects Structure by default", () => {
        render(both);
        expect(tabLabels()).toEqual(["Structure", "How to use"]);
        expect(selectedTab()).toBe("Structure");
        expect(visiblePanels()).toEqual(["data-understanding-panel-structure"]);
        expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1]);
        expect(window.location.hash).toBe("");
    });

    it("switches tabs and records the tab in the URL without a new history entry", () => {
        render(both);
        const historyLength = window.history.length;
        click(tabs()[1]);
        expect(selectedTab()).toBe("How to use");
        expect(visiblePanels()).toEqual([
            "data-understanding-panel-how-to-use"
        ]);
        expect(window.location.hash).toBe("#how-to-use");
        // the path and query are kept
        expect(window.location.pathname).toBe(
            "/dataset/ds-1/distribution/dist-1/details"
        );
        expect(window.location.search).toBe("?q=x");
        expect(window.history.length).toBe(historyLength);
        click(tabs()[0]);
        expect(selectedTab()).toBe("Structure");
        expect(window.location.hash).toBe("#structure");
    });

    it("selects the tab named in the URL", () => {
        window.history.replaceState(null, "", "#how-to-use");
        render(both);
        expect(selectedTab()).toBe("How to use");

        // a tab that isn't available falls back to the first one
        render({ "data-dictionary": openApiDictionary });
        expect(selectedTab()).toBe("Structure");
    });

    it("ignores unrelated hashes", () => {
        window.history.replaceState(null, "", "#something-else");
        render(both);
        expect(selectedTab()).toBe("Structure");
    });

    it("follows hash changes", () => {
        render(both);
        act(() => {
            window.history.replaceState(null, "", "#how-to-use");
            window.dispatchEvent(new HashChangeEvent("hashchange"));
        });
        expect(selectedTab()).toBe("How to use");
    });

    it("supports arrow, Home and End keys", () => {
        render(both);
        key(tabs()[0], "ArrowRight");
        expect(selectedTab()).toBe("How to use");
        expect(document.activeElement).toBe(tabs()[1]);
        key(tabs()[1], "ArrowRight");
        expect(selectedTab()).toBe("Structure");
        expect(document.activeElement).toBe(tabs()[0]);
        key(tabs()[0], "ArrowLeft");
        expect(selectedTab()).toBe("How to use");
        key(tabs()[1], "Home");
        expect(selectedTab()).toBe("Structure");
        key(tabs()[0], "End");
        expect(selectedTab()).toBe("How to use");
        key(tabs()[1], "Enter");
        expect(selectedTab()).toBe("How to use");
    });

    it("keeps each panel's state when switching tabs", () => {
        render(both);
        search("latitude");
        click(tabs()[1]);
        click(tabs()[0]);
        expect(
            container.querySelector<HTMLInputElement>(
                '.data-dictionary input[type="search"]'
            )!.value
        ).toBe("latitude");
    });

    it("shows a request/response entity in Structure when its link is followed", () => {
        render(both);
        click(tabs()[1]);
        const link = container.querySelector<HTMLButtonElement>(
            '[data-operation-id="search-occurrences"] button[data-entity-id="occurrence-record"]'
        )!;
        click(link);
        expect(selectedTab()).toBe("Structure");
        expect(visiblePanels()).toEqual(["data-understanding-panel-structure"]);
        expect(window.location.hash).toBe("#structure");
        expect(
            container
                .querySelector(".data-dictionary__entity")
                ?.getAttribute("data-entity-id")
        ).toBe("occurrence-record");
        expect(document.activeElement).toBe(
            container.querySelector(".data-dictionary")
        );
    });
});
