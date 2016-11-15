import React, { Component } from 'react';
import './DatasetInfo.css';

export default class DatasetInfo extends Component {
  render(){
    let dataset = this.props.dataset;
    return <div className='dataset-info'>
              <div className='traingle'></div>
              <div className='dataset-info-inner'>
                <button className='dataset-info-close-btn'><i className="fa fa-times" aria-hidden="true" onClick={this.props.onClickClose}></i></button>
                <div className='dataset-info--content clearfix'>
                <h5>Contents</h5>
                  <ul className='list-unstyled'>
                    {dataset.distributions.map((d, i)=>
                      <li key={d.downloadURL + i} className={`dataset-info--download-link clearfix ${d.format}`}>
                        <i className='fa fa-file-pdf-o' aria-hidden="true"></i>
                        <a href={d.downloadURL} target='_blank'>{d.description}({d.format})</a>
                      </li>
                    )}
                  </ul>
                </div>
                <div className='dataset-info--licence clearfix'>
                <h5>Licence</h5>
                    Creative Commons Attribution 3.0 Australia
                </div>
              </div>

              <div className='dataset-info-footer clearfix'>
                  <div className='dataset-info-footer--left'>
                    <a className='btn' href={`https://twitter.com/intent/tweet?url=${dataset.landingPage}`} target='_blank'>
                      <i className="fa fa-share-alt" aria-hidden="true"></i>
                    </a>
                  </div>
                  <div className='dataset-info-footer--right'>
                    <a className='btn' href={dataset.landingPage} target='_blank'>View dataset</a>
                  </div>
              </div>
           </div>
  }
}

DatasetInfo.propTypes = {isOpen: React.PropTypes.bool,
                         dataset: React.PropTypes.object};
DatasetInfo.defaultProps = {isOpen: false};
