import React, { Component } from 'react';
import defined from '../helpers/defined';
import MarkdownViewer from '../UI/MarkdownViewer';
import Star from '../UI/Star';
import ToggleList from '../UI/ToggleList';
import './DatasetSummary.css';

export default class DatasetSummary extends Component {
  constructor(props) {
    super(props);
    this.onClick = this.onClick.bind(this);
    this.state ={
      tagsExpanded: false
    }
  }

  onClick(tag, e){
    e.stopPropagation();
    this.props.onClickTag(tag);
  }

  getIcon(format){
    let fileTypes = ['Default', 'CSV', 'DOC', 'DOCX', 'HTML', 'JSON', 'KML', 'PDF', 'TXT', 'XLS','XLSX', 'ZIP'];
    let type = 0;
    if(fileTypes.indexOf(format) > 0){
      type = fileTypes.indexOf(format)
    }
    return `./assets/file-icons/${fileTypes[type]}.png`;
  }

  renderDownloadLink(d){
    return <div className={`media clearfix ${d.format}`}>
            <div className='media-left'>
              <img src={this.getIcon(d.format)} alt={d.format} className='media-object'/>
            </div>
            <div className="media-body">
             <a className='media-heading' href={d.downloadURL} target='_blank'>{d.title}({d.format})</a>
             <div className='license'>{d.license.name}</div>
            </div>
          </div>
  }

  renderLinks(){
    return <div className='dataset-more-info'>
              <div className='source clearfix'>
              <h5 className='sub-heading'>Source</h5>
                  {this.props.dataset.catalog}
              </div>
              <div className='content clearfix'>
                <h5 className='sub-heading'>Contents</h5>
                <ToggleList list={this.props.dataset.distributions}
                            renderFunction={item=>this.renderDownloadLink(item)}
                            className={''}
                            defaultLength={3}
                            getKey={item=>item.downloadURL}/>
              </div>
           </div>
  }

  render(){
    let dataset = this.props.dataset;
    return <div className={`dataset-summary ${this.props.isExpanded ? 'is-expanded': ''}`}>
                <div className='header'>
                  <div className='header-top clearfix'>
                    <button target='_blank'
                            className='dataset-summary-title btn'
                            type='button'
                            onClick={(e)=>{window.open(dataset.landingPage, '_blank')}}>
                      {dataset.title}
                    </button>
                    <button className='dataset-summary-toggle-info-btn hidden-xs'
                                                       onClick={this.props.onClickDataset}
                                                       type='button'>
                        {this.props.isExpanded ? <span>Close</span> : <i className="fa fa-ellipsis-h" aria-hidden="true"></i>}
                    </button>
                  </div>
                  {this.props.isExpanded && <div className='middle clearfix'>
                      <div><a className='btn btn-view-dataset' href={dataset.landingPage} target='_blank'>View dataset</a></div>
                      <div><Star/></div>
                      <div>
                        <a className='btn btn-share' href={`https://twitter.com/intent/tweet?url=${dataset.landingPage}`} target='_blank'>
                          <i className="fa fa-share-alt" aria-hidden="true"></i>
                        </a>
                      </div>
                  </div>}
                </div>
                <div className='body'>
                  <label className='search-result--publisher'>{defined(dataset.publisher) ? dataset.publisher.name : 'unspecified'}</label>
                  <div className='dataset-description' onClick={this.props.onClickDataset}>
                    <MarkdownViewer markdown={dataset.description} stripped={true}/>
                  </div>

                  <ToggleList list={this.props.dataset.keyword}
                              getKey={tag=>tag}
                              renderFunction={tag=><a onClick={this.onClick.bind(this, tag)}>#{tag}</a>}
                              defaultLength={5}
                              className={"dataset-summary-tags"}
                              />

                </div>
              <div className='footer'>
                  {this.props.isExpanded && this.renderLinks()}
                  <div className='dataset-summary-mobile-footer visible-xs clearfix'>
                    <button className='dataset-summary-toggle-info-btn'
                                                       onClick={this.props.onClickDataset}
                                                       type='button'>
                        {this.props.isExpanded ? <span>Close</span> : <i className="fa fa-ellipsis-h" aria-hidden="true"></i>}
                    </button>
                  </div>
              </div>
          </div>
  }
}

DatasetSummary.propTypes = {dataset: React.PropTypes.object};
DatasetSummary.defaultProps = {dataset: {}};
