import React, { Component } from "react";
import { connect } from "react-redux";
import { Link } from "react-router-dom";
import OverviewBox from "../../UI/OverviewBox";

class DatasetOrganisation extends Component {
    renderOrganisation(organisation) {
        return (
            <div className="col-sm-8">
                <h3 className="section-heading">Overview</h3>
                <OverviewBox content={organisation.name} />
                <Link
                    to={`/search?organisation=${encodeURIComponent(
                        organisation.name
                    )}`}
                >
                    View all datasets from {organisation.name}
                </Link>
            </div>
        );
    }

    render() {
        return (
            <div className="dataset-organisation container">
                <div className="row">
                    {this.renderOrganisation(this.props.dataset.organisation)}
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

export default connect(mapStateToProps)(DatasetOrganisation);
