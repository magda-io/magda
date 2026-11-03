import React, {
    FunctionComponent,
    KeyboardEvent,
    useCallback,
    useEffect,
    useRef,
    useState
} from "react";
import { ParsedDistribution } from "helpers/record";
import DataDictionarySection, {
    DataDictionaryEntityFocusRequest
} from "./DataDictionarySection";
import DistributionContractSection from "./DistributionContractSection";
import "./DataUnderstandingTabs.scss";

export type DataUnderstandingTabId = "structure" | "how-to-use";

/** Tabs in information-architecture order: Structure, then How to use. */
export const DATA_UNDERSTANDING_TABS: Array<{
    id: DataUnderstandingTabId;
    label: string;
}> = [
    { id: "structure", label: "Structure" },
    { id: "how-to-use", label: "How to use" }
];

/** Visually hidden on screen (the tab label names the panel); shown in print. */
const PANEL_HEADING_CLASS = "data-understanding__panel-heading";

function isTabId(value: string): value is DataUnderstandingTabId {
    return DATA_UNDERSTANDING_TABS.some((tab) => tab.id === value);
}

function getHashTab(): DataUnderstandingTabId | undefined {
    const hash = window.location.hash.replace(/^#/, "");
    return isTabId(hash) ? hash : undefined;
}

/**
 * Record the selected tab in the URL hash so the tab can be linked to.
 *
 * This deliberately bypasses the router: a router navigation would scroll the
 * page to the top (`ScrollToTop`) and reset other location listeners. It
 * replaces the current history entry, so Back still leaves the page.
 */
function setHashTab(id: DataUnderstandingTabId) {
    window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}#${id}`
    );
}

/**
 * The Data Understanding sections of a distribution (Structure from the
 * `data-dictionary` aspect, How to use from the `distribution-contract`
 * aspect) as tabs, so users can switch between them without scrolling.
 *
 * - The tab bar is always shown, even with a single tab: tab labels replace
 *   the section headings.
 * - Structure is selected by default; `#structure` / `#how-to-use` in the URL
 *   select (and link to) a tab.
 * - Both panels stay mounted, so a field search or selected entity survives
 *   switching tabs.
 * - Following a request/response entity link in How to use switches to
 *   Structure and shows that entity.
 *
 * Renders nothing when the distribution has neither aspect.
 */
const DataUnderstandingTabs: FunctionComponent<{
    distribution: ParsedDistribution;
}> = ({ distribution }) => {
    const { dataDictionary, distributionContract } = distribution;
    const tabs = DATA_UNDERSTANDING_TABS.filter(({ id }) =>
        id === "structure" ? !!dataDictionary : !!distributionContract
    );

    const initialHashTab = useRef(getHashTab());
    const [selectedId, setSelectedId] = useState(initialHashTab.current);
    const [focusEntity, setFocusEntity] = useState<
        DataDictionaryEntityFocusRequest
    >();
    const containerRef = useRef<HTMLDivElement>(null);
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

    const activeId = tabs.some((tab) => tab.id === selectedId)
        ? selectedId!
        : tabs[0]?.id;

    // a link to a tab (`#how-to-use`) also brings the tabs into view
    useEffect(() => {
        const container = containerRef.current;
        if (
            initialHashTab.current &&
            container &&
            typeof container.scrollIntoView === "function"
        ) {
            container.scrollIntoView({ block: "start" });
        }
    }, []);

    // e.g. the hash edited by hand
    useEffect(() => {
        const onHashChange = () => {
            const hashTab = getHashTab();
            if (hashTab) {
                setSelectedId(hashTab);
            }
        };
        window.addEventListener("hashchange", onHashChange);
        return () => window.removeEventListener("hashchange", onHashChange);
    }, []);

    const selectTab = useCallback((id: DataUnderstandingTabId) => {
        setSelectedId(id);
        setHashTab(id);
    }, []);

    const showEntity = useCallback(
        (entityId: string) => {
            selectTab("structure");
            setFocusEntity((previous) => ({
                entityId,
                requestId: (previous?.requestId ?? 0) + 1
            }));
        },
        [selectTab]
    );

    if (!tabs.length) {
        return null;
    }

    // WAI-ARIA tabs pattern with automatic activation
    const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        const current = tabs.findIndex((tab) => tab.id === activeId);
        let next: number;
        switch (event.key) {
            case "ArrowRight":
                next = (current + 1) % tabs.length;
                break;
            case "ArrowLeft":
                next = (current - 1 + tabs.length) % tabs.length;
                break;
            case "Home":
                next = 0;
                break;
            case "End":
                next = tabs.length - 1;
                break;
            default:
                return;
        }
        event.preventDefault();
        selectTab(tabs[next].id);
        tabRefs.current[next]?.focus();
    };

    const panelProps = (id: DataUnderstandingTabId) => ({
        id: `data-understanding-panel-${id}`,
        role: "tabpanel",
        "aria-labelledby": `data-understanding-tab-${id}`,
        className: "data-understanding__panel",
        hidden: id !== activeId
    });

    return (
        <div className="data-understanding" ref={containerRef}>
            <div
                className="data-understanding__tabs"
                role="tablist"
                aria-label="About this data"
            >
                {tabs.map((tab, idx) => {
                    const selected = tab.id === activeId;
                    return (
                        <button
                            key={tab.id}
                            ref={(element) => (tabRefs.current[idx] = element)}
                            id={`data-understanding-tab-${tab.id}`}
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            aria-controls={`data-understanding-panel-${tab.id}`}
                            tabIndex={selected ? 0 : -1}
                            className={`data-understanding__tab${
                                selected
                                    ? " data-understanding__tab--selected"
                                    : ""
                            }`}
                            onClick={() => selectTab(tab.id)}
                            onKeyDown={onTabKeyDown}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>
            {dataDictionary ? (
                <div {...panelProps("structure")}>
                    <DataDictionarySection
                        dataDictionary={dataDictionary}
                        focusEntity={focusEntity}
                        headingClassName={PANEL_HEADING_CLASS}
                    />
                </div>
            ) : null}
            {distributionContract ? (
                <div {...panelProps("how-to-use")}>
                    <DistributionContractSection
                        distributionContract={distributionContract}
                        dataDictionary={dataDictionary}
                        onSelectEntity={showEntity}
                        headingClassName={PANEL_HEADING_CLASS}
                    />
                </div>
            ) : null}
        </div>
    );
};

export default DataUnderstandingTabs;
