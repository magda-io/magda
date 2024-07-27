import "es6-symbol/implement";
import React, { Component } from "react";
import DataPreviewTable from "./DataPreviewTable";
import DataPreviewChart from "./DataPreviewChart";
import { ParsedDataset, ParsedDistribution } from "helpers/record";
import DataPreviewSizeWarning from "./DataPreviewSizeWarning";
import CsvDataLoader, { DataLoadingResult } from "helpers/CsvDataLoader";
import {
    checkFileForPreview,
    FileSizeCheckResult,
    FileSizeCheckStatus
} from "../../helpers/DistributionPreviewUtils";
import "./DataPreviewVis.scss";
import unknown2Error from "@magda/typescript-common/dist/unknown2Error.js";
type VisType = "chart" | "table";

type StateType = {
    visType: VisType;
    isDataLoading: boolean;
    dataLoadingError: Error | null;
    dataLoadingResult: DataLoadingResult | null;
    fileSizeCheckResult: FileSizeCheckResult | null;
};

class DataPreviewVis extends Component<
    {
        distribution: ParsedDistribution | null;
        dataset?: ParsedDataset;
    },
    StateType
> {
    private dataLoader: CsvDataLoader | null = null;

    constructor(props) {
        super(props);
        this.state = {
            visType: "chart",
            isDataLoading: true,
            dataLoadingError: null,
            dataLoadingResult: null,
            fileSizeCheckResult: null
        };
        this.onChangeTab = this.onChangeTab.bind(this);
        this.dataLoader = null;
    }

    componentDidMount() {
        this.loadData();
    }

    componentDidUpdate(prevProps) {
        const distribution = this.props.distribution;
        const prevDistribution = prevProps.distribution;
        if (distribution !== prevDistribution) {
            this.loadData();
        }
    }

    componentWillUnmount() {
        if (this.dataLoader) {
            this.dataLoader.abort();
        }
    }

    /**
     * Load the data for preview
     *
     * @param ignoreOversize Whether to download the file even if it's oversize
     */
    async loadData(ignoreOversize?: boolean) {
        try {
            // If none of chart & table compatiblePreviews option is false, no need to load data
            const distribution = this.props.distribution;
            if (
                !distribution ||
                !distribution.identifier ||
                // -- Optional `preview-tabular-data-settings` aspect can explicitly disable chart or table view
                ((!distribution.compatiblePreviews.chart ||
                    distribution?.rawData?.aspects?.[
                        "preview-tabular-data-settings"
                    ]?.enableChart === false) &&
                    (!distribution.compatiblePreviews.table ||
                        distribution?.rawData?.aspects?.[
                            "preview-tabular-data-settings"
                        ]?.enableTable === false))
            ) {
                return;
            }

            // We can preview this - set loading to true
            this.setState({
                isDataLoading: true,
                dataLoadingError: null,
                dataLoadingResult: null,
                fileSizeCheckResult: null
            });

            // Check the size - if it's too big we shouldn't preview until the user opts in
            if (!ignoreOversize) {
                const fileSizeCheckResult = await checkFileForPreview(
                    distribution
                );

                if (
                    fileSizeCheckResult.fileSizeCheckStatus !==
                    FileSizeCheckStatus.Ok
                ) {
                    this.setState({
                        isDataLoading: false,
                        fileSizeCheckResult
                    });
                    return;
                }
            }

            this.dataLoader = new CsvDataLoader(this.props.distribution);

            const result = await this.dataLoader.load();

            this.setState({
                isDataLoading: false,
                dataLoadingResult: result
            });

            // --- the CSV processing error could be caused by many reasons
            // --- most them here should be source file problem
            // --- But we might still want to keep monitor any rare non-source-file related issues here
            if (result.parseResult && result.parseResult.errors.length) {
                console.log(
                    "CSV data processing error: ",
                    result.parseResult.errors
                );
            }
        } catch (e) {
            this.setState({
                isDataLoading: false,
                dataLoadingError: unknown2Error(e),
                dataLoadingResult: null
            });
            console.error("Failed to process CSV data file: ", e);
        }
    }

    renderChart() {
        if (!this.props.distribution) return null;
        return (
            <DataPreviewChart
                distribution={this.props.distribution}
                dataLoadingResult={this.state.dataLoadingResult}
                dataLoadError={this.state.dataLoadingError}
                isLoading={this.state.isDataLoading}
                onChangeTab={this.onChangeTab}
            />
        );
    }

    renderTable() {
        return (
            <DataPreviewTable
                dataLoadingResult={this.state.dataLoadingResult}
                dataLoadError={this.state.dataLoadingError}
                isLoading={this.state.isDataLoading}
            />
        );
    }

    onChangeTab(tab) {
        this.setState({
            visType: tab
        });
    }

    /**
     * Return rendered <Tabs> object with tab items
     * @param {Array} tabs - Array of tab items
     */
    renderTabs(tabs) {
        const activeTab = tabs.find(
            (item, i) =>
                item.value.toLowerCase() === this.state.visType.toLowerCase()
        );

        return (
            <nav className="tab-navigation">
                <ul className="au-link-list au-link-list--inline tab-list">
                    {tabs.map((t) => (
                        <li key={t.value}>
                            <button
                                className={`${t.value.toLowerCase()} au-link ${
                                    t.value.toLowerCase() === activeTab.value
                                        ? "tab-active"
                                        : null
                                }`}
                                value={t.value.toLowerCase()}
                                onClick={this.onChangeTab.bind(
                                    this,
                                    t.value.toLowerCase()
                                )}
                            >
                                {t.label}
                            </button>
                        </li>
                    ))}
                </ul>
                {activeTab.action}
            </nav>
        );
    }

    renderByState() {
        if (
            this.state.fileSizeCheckResult &&
            this.state.fileSizeCheckResult.fileSizeCheckStatus !==
                FileSizeCheckStatus.Ok
        ) {
            return (
                <DataPreviewSizeWarning
                    fileSizeCheckResult={this.state.fileSizeCheckResult}
                    preview={() => this.loadData(true)}
                />
            );
        }

        const distribution = this.props.distribution;
        if (distribution && distribution.identifier) {
            // Render chart if there's chart fields, table if fields, both if both
            // -- Optional `preview-tabular-data-settings` aspect can explicitly disable chart or table view
            const tabs = [
                distribution.compatiblePreviews.chart &&
                    distribution?.rawData?.aspects?.[
                        "preview-tabular-data-settings"
                    ]?.enableChart !== false &&
                    TabItem("chart", "Chart", this.renderChart()),
                distribution.compatiblePreviews.table &&
                    distribution?.rawData?.aspects?.[
                        "preview-tabular-data-settings"
                    ]?.enableTable !== false &&
                    TabItem("table", "Table", this.renderTable())
            ].filter((x) => !!x);

            return tabs.length ? this.renderTabs(tabs) : null;
        }
        return undefined;
    }

    render() {
        const bodyRenderResult = this.renderByState();
        if (!bodyRenderResult) return null;
        return (
            <div className="data-preview-vis no-print">
                <h3 className="section-heading">Data Preview</h3>

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
