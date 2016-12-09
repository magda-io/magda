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

  truncate(s) {
    return s.substring(0,200) + '...';
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
    return <div className={`dataset-more-info ${this.props.isExpanded ? 'is-open' : ''}`}>
              <div className='source clearfix'>
              <h5>Source</h5>
                  {this.props.dataset.catalog}
              </div>
              <div className='content clearfix'>
              <h5>Contents</h5>
                <ul className='list-unstyled'>
                  {this.props.dataset.distributions.map((d, i)=>
                    <li key={i} className={`dataset-info--download-link clearfix ${d.format}`}>
                      <img src={this.getIcon(d.format)} alt={d.format} className='dataset-file-icon'/>
                      <a href={d.downloadURL} target='_blank'>{d.title}({d.format})</a>
                    </li>
                  )}
                </ul>
              </div>
           </div>
  }

  render(){
    let dataset = this.props.dataset;
    return <div className={`dataset-summray ${this.props.isExpanded ? 'is-expanded': ''}`}>
              <div className='dataset-summray-main'>
                <div className='header'>
                  <div className='header-left'>
                    <button target='_blank'
                            className='dataset-summray-title btn'
                            type='button'
                            onClick={(e)=>{window.open(dataset.landingPage, '_blank')}}>
                      {dataset.title}
                    </button>
                  </div>
                  <div className='header-right hidden-xs'>
                    <button className='dataset-summray-toggle-info-btn'
                                                       onClick={this.props.onClickDataset}
                                                       type='button'>
                        {this.props.isExpanded ? <span>Close</span> : <i className="fa fa-ellipsis-h" aria-hidden="true"></i>}
                    </button>
                  </div>
                </div>
                <div className='middle'>
                    <Star/>
                </div>
                <label className='search-result--publisher'>{defined(dataset.publisher) ? dataset.publisher.name : 'unspecified'}</label>
                <div className='dataset-description' onClick={this.props.onClickDataset}>
                  <MarkdownViewer markdown={dataset.description} stripped={true}/>
                </div>
                <ul className='list-unstyled tags'>
                  {this.getTags()}
                </ul>
              </div>
              <div className='dataset-summary-mobile-footer visible-xs clearfix'>
              {!this.props.isExpanded && <button className='dataset-summray-toggle-info-btn'
                                                 onClick={this.props.onClickDataset}
                                                 type='button'>
                  <i className="fa fa-ellipsis-h" aria-hidden="true"></i>
              </button>}
              </div>
                {this.renderLinks()}
          </div>
  }
}

DatasetSummary.propTypes = {dataset: React.PropTypes.object};
DatasetSummary.defaultProps = {dataset: {}};
