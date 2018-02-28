import React, { Component } from "react";
import TemporalAspectViewer from "../../UI/TemporalAspectViewer";
import DescriptionBox from "../../UI/DescriptionBox";
import MarkdownViewer from "../../UI/MarkdownViewer";
import StarRating from "../../UI/StarRating";
import TagsBox from "../../UI/TagsBox";
import { connect } from "react-redux";
import renderDistribution from "../../Components/Distribution";
import "./RecordDetails.css";

class DatasetDetails extends Component {
    state = {
        showPreview: false
    };
    render() {

        const dataset = this.props.dataset;
        const datasetId = this.props.match.params.datasetId;

        const source = `This dataset was originally found on [${
            this.props.dataset.source
        }](${dataset.landingPage})`;
        return (
            <div className="dataset-details container">
                <div className="mui-row">
                    <div className="dataset-details__body mui-col-sm-12">
                        <div className="dataset-details-overview">
                            <DescriptionBox content={dataset.description} />
                        </div>
                        <div className="quality-rating-box">
                            <span>Data Quality: &nbsp;&nbsp;</span>
                            <StarRating stars={dataset.linkedDataRating} />
                        </div>
                        <TagsBox tags={dataset.tags}/>
                        
                        <div className="dataset-details-links">
                            <h3 className="clearfix">
                                <span className="section-heading">
                                    Data and APIs
                                </span>
                            </h3>
                            <div className="clearfix">
                                {dataset.distributions.map(s =>
                                    renderDistribution(
                                        s,
                                        datasetId,
                                        this.state.showPreview
                                    )
                                )}
                            </div>
                        </div>
                        <div className="dataset-details-source">
                            <h3 className="section-heading">Data Source</h3>
                            <MarkdownViewer
                                markdown={source}
                                truncate={false}
                            />
                            <a className="landing-page" href="dataset.landingPage">{dataset.landingPage}</a>
                        </div>
                        <div className="dataset-details-temporal-coverage" style={{display:"none"}}>
                            <h3 className="section-heading">
                                Temporal coverage
                            </h3>
                            <TemporalAspectViewer
                                data={dataset.temporalCoverage}
                            />
                        </div>
                    </div>
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

export default connect(mapStateToProps)(DatasetDetails);
