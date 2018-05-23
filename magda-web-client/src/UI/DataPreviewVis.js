import "es6-symbol/implement";
import React, { Component } from "react";
import DataPreviewTable from "./DataPreviewTable";
import DataPreviewChart from "./DataPreviewChart";
import type { ParsedDistribution } from "../helpers/record";

import "./DataPreviewVis.css";

class DataPreviewVis extends Component<{
    distribution: ParsedDistribution
}> {
    constructor(props) {
        super(props);
        this.state = {
            chartType: "line",
            chartTitle: "",
            yAxis: null,
            xAxis: null,
            xScale: "temporal",
            yScale: "quantitative"
        };
    }

    renderChart() {
        return <DataPreviewChart distribution={this.props.distribution} />;
    }

    renderTable() {
        return <DataPreviewTable distribution={this.props.distribution} />;
    }

    /**
     * Return rendered <Tabs> object with tab items
     * @param {Array} tabs - Array of tab items
     */
    renderTabs(tabs) {
        const hash = window.location.hash;
        const activeTabName = hash ? hash.slice(1, hash.length) : "chart";

        const activeTab = tabs.find(
            (item, i) =>
                item.value.toLowerCase() === activeTabName.toLowerCase()
        );
        return (
            <nav className="tab-navigation">
                <ul className="au-link-list  au-link-list--inline">
                    {tabs.map(t => (
                        <li key={t.value}>
                            <a
                                className={`${
                                    t.value.toLowerCase() ===
                                    activeTabName.toLowerCase()
                                        ? "mainmenu--active"
                                        : null
                                }`}
                                href={`#${t.value}`}
                            >
                                {t.label}
                            </a>
                        </li>
                    ))}
                </ul>
                {activeTab.action}
            </nav>
        );
    }

    renderByState() {
        const distribution = this.props.distribution;
        if (distribution && distribution.identifier) {
            // Render chart if there's chart fields, table if fields, both if both
            const tabs = [
                distribution.compatiblePreviews.chart &&
                    TabItem("chart", "Chart", this.renderChart()),
                distribution.compatiblePreviews.table &&
                    TabItem("table", "Table", this.renderTable())
            ].filter(x => !!x);

            return tabs.length ? this.renderTabs(tabs) : null;
        }
    }

    render() {
        const bodyRenderResult = this.renderByState();
        if (!bodyRenderResult) return null;
        return (
            <div className="data-preview-vis">
                <h3>Data Preview</h3>
                {bodyRenderResult}
            </div>
        );
    }
}

/**
 * Encapsulate tab object
 * @param {string} value
 * @param {string} item
 * @param {function} action
 */
const TabItem = (value, item, action) => {
    return {
        value: value,
        label: item,
        action: action
    };
};

export default DataPreviewVis;
