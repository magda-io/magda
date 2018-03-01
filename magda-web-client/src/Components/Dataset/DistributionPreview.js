import React, { Component } from "react";
import { connect } from "react-redux";

class DistributionPreview extends Component {
    render() {
        return (
            <div className="dataset-preview container">
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
