import React, { Component } from "react";
import DataPreviewer from "../DataPreviewer";
import { connect } from "react-redux";

class DistributionPreview extends Component {
    render() {
        return <DataPreviewer distribution={this.props.distribution} />;
    }
}

function mapStateToProps(state) {
    const distribution = state.record.distribution;
    return {
        distribution
    };
}

export default connect(mapStateToProps)(DistributionPreview);
