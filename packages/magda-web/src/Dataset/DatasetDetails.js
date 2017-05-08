import React, { Component } from 'react';
import defined from '../helpers/defined';
import MarkdownViewer from '../UI/MarkdownViewer';
import TemporalAspectViewer from '../UI/TemporalAspectViewer';
import SpatialAspectViewer from '../UI/SpatialAspectViewer';
import CustomIcons from '../UI/CustomIcons';
import Star from '../UI/Star';
import { Link } from 'react-router';
import { connect } from "react-redux";
import './DatasetDetails.css';
class DatasetDetails extends Component {
  constructor(props){
    super(props);
    this.state = {
      isExpanded: false
    }
    this.toggleExpand = this.toggleExpand.bind(this);
  }

  toggleExpand(){
    this.setState({
      isExpanded: !this.state.isExpanded
    })

  }
  renderDistribution(distribution, datasetId){
    return <div className="media" key={distribution.id}>
              {<div className="media-left"> <CustomIcons className="media-object" name={distribution.format}/></div>}
              <div className="media-body">
                <h3><Link to={`/dataset/${datasetId}/distribution/${distribution.id}`}>{distribution.title}({distribution.format})</Link></h3>
                <div>{distribution.description}</div>
                <div>{distribution.license}</div>
              </div>
            </div>
  }

  render(){
    const dataset = this.props.dataset;
    const datasetId = this.props.params.datasetId;
    return <div className="dataset-details container">
              <div className="row">
                <div className='dataset-details__body col-sm-9'>
                  <div className='dataset-details-overview'>
                    <h3>Overview</h3>
                    <div className="white-box">
                      {dataset.description && <MarkdownViewer markdown={dataset.description} stripped={!this.state.isExpanded}/>}
                      <button onClick={this.toggleExpand} className="overview-toggle btn btn-reset"><i className={`fa fa-chevron-${this.state.isExpanded ? "up" : "down"}`} aria-hidden="true"></i></button>
                    </div>
                  </div>

                  <div className='dataset-details-source'>
                      <h3>Data and APIs</h3>
                      <div className="white-box">{
                        dataset.source && dataset.source.map(s=> this.renderDistribution(s, datasetId))
                      }</div>
                  </div>
                  <div className="dataset-details-spatial-coverage">
                      <h3>Spatial coverage</h3>
                      <SpatialAspectViewer/>
                  </div>
                  <div className="dataset-details-temporal-coverage">
                      <h3>Temporal coverage</h3>
                      <TemporalAspectViewer/>
                  </div>
              </div>

              <div className='dataset-details__sidebar col-sm-3'>
                  <div><button className='btn btn-primary'>Add to project</button></div>
                  <div><button className='btn btn-default'>Star</button></div>
                  <div><button className='btn btn-default'>Subscribe</button></div>
                  <div><button className='btn btn-default'>Share</button></div>
                  <div className="tags">
                    <h5>Tags</h5>
                    {
                      dataset.tags && dataset.tags.map(t=><Link className="badge" key={t} to={`/search?${t}`}>{t}</Link>)
                    }
                  </div>
              </div>
              </div>
          </div>
  }
}

function mapStateToProps(state) {
  const record= state.record;
  const dataset = record.dataset;
  return {
    dataset
  };
}


DatasetDetails.propTypes = {dataset: React.PropTypes.object};

export default connect(mapStateToProps)(DatasetDetails);