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

  render(){
    let dataset = this.props.dataset;
    return <div className='dataset-summray' onClick={(e)=>{window.open(dataset.landingPage, '_blank');}}>
              <div className='dataset-summray-main'>
                <h3 className='result-header'>
                  <div className='result-header-left'>
                    <span target='_blank' className='dataset-summray-title' type='button'>{dataset.title}</span>
                  </div>
                  <div className='result-header-middle'>
                    <Star/>
                  </div>
                  <div className='result-header-right'>
                    {!this.props.isExpanded && <button className='dataset-summray-toggle-info-btn'
                                                       onClick={this.props.onClickDataset}
                                                       type='button'>
                        <i className="fa fa-ellipsis-h" aria-hidden="true"></i>
                    </button>}
                  </div>
                </h3>
                {defined(dataset.publisher) && <label className='search-result--publisher'>{dataset.publisher.name}</label>}
                <div className='dataset-description'>
                  <MarkdownViewer markdown={dataset.description}/>
                </div>
                <ul className='list-unstyled tags'>
                  {this.getTags()}
                </ul>
              </div>
          </div>
  }
}

DatasetSummary.propTypes = {dataset: React.PropTypes.object};
DatasetSummary.defaultProps = {dataset: {}};
