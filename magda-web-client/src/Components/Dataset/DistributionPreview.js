import React, { Component } from "react";
import DataPreviewGoogleViewer from "../../UI/DataPreviewGoogleViewer";
import { fetchPreviewData } from "../../actions/previewDataActions";
import ProgressBar from "../../UI/ProgressBar";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";

class DistributionPreview extends Component {
    componentWillMount() {
        this.props.fetchPreviewData(this.props.distribution);
    }

    componentWillReceiveProps(nextProps) {
        if (
            nextProps.distribution.downloadURL &&
            nextProps.distribution.downloadURL !==
                this.props.distribution.downloadURL
        ) {
            this.props.fetchPreviewData(this.props.distribution);
        }
    }

    visualisable() {
        return !this.props.isFetching && !this.props.error && this.props.data;
    }

    renderByState(previewData) {
        return <DataPreviewGoogleViewer data={previewData} />;
    }

    render() {
        const url = this.props.url;
        return (
            <div className="data-previewer">
                <h3 className="section-heading">
                    <a href={url} target="_blank">
                        {url && url.substring(url.lastIndexOf("/") + 1)}
                    </a>
                </h3>
                {this.props.error && <div>{this.props.error}</div>}
                {this.props.isFetching && <ProgressBar />}
                {this.props.data &&
                    this.props.distribution.identifier &&
                    this.props.data[this.props.distribution.identifier] &&
                    this.renderByState(
                        this.props.data[this.props.distribution.identifier]
                    )}
            </div>
        );
    }
}

function mapStateToProps(state) {
    const distribution = state.record.distribution;
    const previewData = state.previewData;
    const data = previewData.previewData;
    const isFetching = previewData.isFetching;
    const error = previewData.error;
    const url = previewData.url;
    return {
        distribution,
        data,
        isFetching,
        error,
        url
    };
}

const mapDispatchToProps = dispatch => {
    return bindActionCreators(
        {
            fetchPreviewData: fetchPreviewData
        },
        dispatch
    );
};

export default connect(mapStateToProps, mapDispatchToProps)(
    DistributionPreview
);
