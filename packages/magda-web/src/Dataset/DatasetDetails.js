import React, { Component } from 'react';
import defined from '../helpers/defined';
import MarkdownViewer from '../UI/MarkdownViewer';
import Star from '../UI/Star';
import { Link } from 'react-router';
import { connect } from "react-redux";
import './DatasetDetails.css';
class DatasetDetails extends Component {
  renderDistribution(distribution, datasetId){
    debugger
    return <div className="" key={distribution.id}>
              <h4><Link to={`/dataset/${datasetId}/distribution/${distribution.id}`}>{distribution.title}({distribution.format})</Link></h4>
              <div>{distribution.description}</div>
              <div>{distribution.license}</div>
            </div>
  }

  render(){
    const dataset = this.props.dataset;
    const datasetId = this.props.params.datasetId;
    return <div className="dataset-details container">
              <div className="row">
                <div className='dataset-details__body col-sm-9'>
                  <div className='dataset-details-overview'>
                    <h4>Overview</h4>
                    <div className="white-box">{dataset.description && <MarkdownViewer markdown={dataset.description}/>}</div>
                  </div>

                  <div className='dataset-details-source'>
                      <h4>Data and APIs</h4>
                      <div className="white-box">{
                        dataset.source && dataset.source.map(s=> this.renderDistribution(s, datasetId))
                      }</div>
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