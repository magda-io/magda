import React, { Component } from "react";
import { connect } from "react-redux";
import { Link } from "react-router-dom";
import OverviewBox from "../../UI/OverviewBox";

class DatasetPublisher extends Component {
    renderPublisher(publisher) {
        return (
            <div className="col-sm-8">
                <h3 className="section-heading">Overview</h3>
                <OverviewBox content={publisher.name} />
                <Link
                    to={`/search?organisation=${encodeURIComponent(
                        publisher.name
                    )}`}
                >
                    View all datasets from {publisher.name}
                </Link>
            </div>
        );
    }

    render() {
        return (
            <div className="dataset-publisher container">
                <div className="row">
                    {this.renderPublisher(this.props.dataset.publisher)}
                </div>
            </div>
        );
    }
}

function mapStateToProps(state) {
    const record = state.record;
    const dataset = record.dataset;
    return {
        dataset
    };
}

export default connect(mapStateToProps)(DatasetPublisher);
