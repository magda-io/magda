import React, { Component } from 'react';
import './DatasetInfo.css';

export default class DatasetInfo extends Component {
  getIcon(format){
    let fileTypes = ['Default', 'CSV', 'DOC', 'DOCX', 'HTML', 'JSON', 'KML', 'PDF', 'TXT', 'XLS','XLSX', 'ZIP'];
    let type = 0;
    if(fileTypes.indexOf(format) > 0){
      type = fileTypes.indexOf(format)
    }
    return `./assets/file-icons/${fileTypes[type]}.png`;
  }
  render(){
    let dataset = this.props.dataset;
    return <div className='dataset-info'>
              <div className='traingle'></div>
              <div className='dataset-info-inner'>
                <button className='dataset-info-close-btn'><i className="fa fa-times" aria-hidden="true" onClick={this.props.onClickClose}></i></button>
                <div className='dataset-info--source clearfix'>
                <h5>Source</h5>
                    {dataset.catalog}
                </div>
                <div className='dataset-info--content clearfix'>
                <h5>Contents</h5>
                  <ul className='list-unstyled'>
                    {dataset.distributions.map((d, i)=>
                      <li key={i} className={`dataset-info--download-link clearfix ${d.format}`}>
                        <img src={this.getIcon(d.format)} alt={d.format} className='dataset-file-icon'/>
                        <a href={d.downloadURL} target='_blank'>{d.title}({d.format})</a>
                      </li>
                    )}
                  </ul>
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

DatasetInfo.propTypes = {dataset: React.PropTypes.object};
