import React, { Component } from "react";
import { connect } from "react-redux";
import DataPreviewMap from "Components/Common/DataPreviewMap";
import DataPreviewTable from "Components/Common/DataPreviewTable";
import DataPreviewTextBox from "Components/Common/DataPreviewTextBox";
import DataPreviewGoogleViewer from "Components/Common/DataPreviewGoogleViewer";
import DataPreviewJson from "Components/Common/DataPreviewJson";
import DataPreviewChart from "Components/Common/DataPreviewChart";
import DataPreviewNews from "Components/Common/DataPreviewNews";
import ProgressBar from "Components/Common/ProgressBar";
import CommonLink from "Components/Common/CommonLink";

const DataPreviewHtml = ({ distribution }) => (
    <iframe
        title="preview"
        width="100%"
        height="600px"
        src={distribution.downloadURL || distribution.accessURL}
    />
);

const DataPreviewNone = () => "This distribution cannot be previewed";

class DistributionPreview extends Component {
    renderByState() {
        // Decide which visualisation to use using visualization-info
        // Compatibility is decided by backend "visualization minion"
        const compatiblePreviews = this.props.distribution.compatiblePreviews;
        let DataPreviewComponent = DataPreviewNone;
        if (compatiblePreviews.map) {
            return <DataPreviewMap distributions={[this.props.distribution]} />;
        } else if (compatiblePreviews.chart) {
            DataPreviewComponent = DataPreviewChart;
        } else if (compatiblePreviews.table) {
            DataPreviewComponent = DataPreviewTable;
        } else if (compatiblePreviews.json) {
            DataPreviewComponent = DataPreviewJson;
        } else if (compatiblePreviews.html) {
            DataPreviewComponent = DataPreviewHtml;
        } else if (compatiblePreviews.text) {
            DataPreviewComponent = DataPreviewTextBox;
        } else if (compatiblePreviews.rss) {
            DataPreviewComponent = DataPreviewNews;
        } else if (compatiblePreviews.google) {
            DataPreviewComponent = DataPreviewGoogleViewer;
        }
        return <DataPreviewComponent distribution={this.props.distribution} />;
    }

    render() {
        const url = this.props.distribution.downloadURL;
        return (
            <div className="data-previewer">
                <h3 className="section-heading">
                    <CommonLink
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {url && url.substring(url.lastIndexOf("/") + 1)}
                    </CommonLink>
                </h3>
                {this.props.error && <div>{this.props.error}</div>}
                {this.props.isFetching && <ProgressBar />}
                {this.props.distribution.identifier && this.renderByState()}
            </div>
        );
    }
}

function mapStateToProps(state) {
    const distribution = state.record.distribution;
    return {
        distribution
    };
}

export default connect(mapStateToProps)(DistributionPreview);
