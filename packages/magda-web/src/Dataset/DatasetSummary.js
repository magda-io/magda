import React, { Component } from 'react';
import defined from '../helpers/defined';
import MarkdownViewer from '../UI/MarkdownViewer';
import Star from '../UI/Star';
import './DatasetSummary.css';

export default class DatasetSummary extends Component {
  constructor(props) {
    super(props);
    this.onClick = this.onClick.bind(this);
    this.getTags = this.getTags.bind(this);
    this.state ={
      tagsExpanded: false
    }
  }

  onClick(tag, e){
    e.stopPropagation();
    this.props.onClickTag(tag);
  }

  getTags(){
    let allTags = this.props.dataset.keyword;
    let tags = allTags;
    let defaultSize = 5;
    let toggleText = '';
    let that = this;

    function toggleTagExpansion(e){
      e.stopPropagation();
      that.setState({
        tagsExpanded: !that.state.tagsExpanded
      })
    }
    if(allTags.length > defaultSize){
      if(!this.state.tagsExpanded){
        tags = allTags.slice(0, defaultSize-1);
        toggleText = `show ${allTags.length - defaultSize} more tags`;
      } else{
        tags = allTags;
        toggleText = `show ${allTags.length - defaultSize} less tags`;
      }
    }
    return <ul className='list-unstyled search-result-tags'>
        {tags.map((tag, i)=>
          <li key={`${tag}-${i}`} className='search-result-tag'><a onClick={this.onClick.bind(this, tag)}>#{tag}</a></li>
        )}
        {allTags.length > defaultSize &&
          <li><button className='search-result--tag-toggle btn' onClick={toggleTagExpansion} >{toggleText}</button></li>
        }
    </ul>
  }

  getIcon(format){
    let fileTypes = ['Default', 'CSV', 'DOC', 'DOCX', 'HTML', 'JSON', 'KML', 'PDF', 'TXT', 'XLS','XLSX', 'ZIP'];
    let type = 0;
    if(fileTypes.indexOf(format) > 0){
      type = fileTypes.indexOf(format)
    }
    return `./assets/file-icons/${fileTypes[type]}.png`;
  }

  renderLinks(){
    return <div className='dataset-more-info'>
              <div className='source clearfix'>
              <h5 className='sub-heading'>Source</h5>
                  {this.props.dataset.catalog}
              </div>
              <div className='content clearfix'>
              <h5 className='sub-heading'>Contents</h5>
                <ul className='list-unstyled'>
                  {this.props.dataset.distributions.map((d, i)=>
                    <li key={i} className={`media clearfix ${d.format}`}>
                      <div className='media-left'>
                        <img src={this.getIcon(d.format)} alt={d.format} className='media-object'/>
                      </div>
                      <div className="media-body">
                        <a className='media-heading' href={d.downloadURL} target='_blank'>{d.title}({d.format})</a>
                        <div className='license'>{d.license.name}</div>
                      </div>
                    </li>
                  )}
                </ul>
              </div>
           </div>
  }

  render(){
    let dataset = this.props.dataset;
    return <div className={`dataset-summray ${this.props.isExpanded ? 'is-expanded': ''}`}>
                <div className='header'>
                  <div className='header-top clearfix'>
                    <button target='_blank'
                            className='dataset-summray-title btn'
                            type='button'
                            onClick={(e)=>{window.open(dataset.landingPage, '_blank')}}>
                      {dataset.title}
                    </button>
                    <button className='dataset-summray-toggle-info-btn hidden-xs'
                                                       onClick={this.props.onClickDataset}
                                                       type='button'>
                        {this.props.isExpanded ? <span>Close</span> : <i className="fa fa-ellipsis-h" aria-hidden="true"></i>}
                    </button>
                  </div>
                  {this.props.isExpanded && <div className='middle clearfix'>
                      <div><a className='btn btn-view-dataset' href={dataset.landingPage} target='_blank'>View dataset</a></div>
                      <div><Star/></div>
                      <div>
                        <a className='btn' href={`https://twitter.com/intent/tweet?url=${dataset.landingPage}`} target='_blank'>
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
                  <ul className='list-unstyled tags'>
                    {this.getTags()}
                  </ul>
                </div>
              <div className='footer'>
                  {this.props.isExpanded && this.renderLinks()}
                  <div className='dataset-summary-mobile-footer visible-xs clearfix'>
                    <button className='dataset-summray-toggle-info-btn'
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
