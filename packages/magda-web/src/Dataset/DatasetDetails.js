import React, { Component } from 'react';
import defined from '../helpers/defined';
import MarkdownViewer from '../UI/MarkdownViewer';
import Star from '../UI/Star';
import { Link } from 'react-router';

export default class DatasetDetails extends Component {


  renderSource(source){
    return <div className="" key={source.id}>
              <h4>{source.title}({source.format})</h4>
              <div>{source.description}</div>
              <div>{source.licence}</div>
            </div>
  }

  render(){
    let dataset = this.props.dataset;
    return <div className="dataset-details row" >
                <div className='dataset-details__body col-sm-9'>
                  <div className='dataset-details-overview'>
                    <h3>Overview</h3>
                    {dataset.description && <MarkdownViewer markdown={dataset.description}/>}
                  </div>

                  <div className='dataset-details-source'>
                      <h3>Data and APIs</h3>
                      {
                        dataset.source.map(s=> this.renderSource(s))
                      }
                  </div>
              </div>

              <div className='dataset-details__sidebar col-sm-3'>
                  <div><button className='btn btn-primary'>Add to project</button></div>
                  <div><button className='btn btn-default'>Star</button></div>
                  <div><button className='btn btn-subscribe'>Subscribe</button></div>
                  <div><button className='btn btn-chare'>Share</button></div>
                  <div className="tags">
                    <h5>Tags</h5>
                    {
                      dataset.tags.map(t=><span className="badge" key={t}>{t}</span>)
                    }
                  </div>
              </div>
          </div>
  }
}

DatasetDetails.propTypes = {dataset: React.PropTypes.object};
