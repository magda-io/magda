import React, { Component } from 'react';
import defined from '../helpers/defined';
import MarkdownViewer from '../UI/MarkdownViewer';
import Star from '../UI/Star';
import './DatasetSummary.css';

export default class DatasetSummary extends Component {
  constructor(props) {
    super(props);
    this.onClick = this.onClick.bind(this);
  }

  truncate(s) {
    return s.substring(0,200) + '...';
  }

  onClick(tag, e){
    e.stopPropagation();
    this.props.onSearchTextChange(tag);
  }

  render(){
    let dataset = this.props.dataset;
    return <div className='dataset-summray' onClick={(e)=>{window.open(dataset.landingPage, '_blank');}}>
              <div className='dataset-summray-main'>
                <h3 className='result-header'>
                  <div className='result-header-left'>
                    <a href={dataset.landingPage} target='_blank' className='dataset-summray-title' type='button'>{dataset.title}</a>
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
                  {
                    dataset.keyword.map((tag)=>
                      <li key={tag} className='search-result--tag'><a onClick={this.onClick.bind(this, tag)}>#{tag}</a></li>
                    )
                  }
                </ul>
              </div>
              {this.props.children}
          </div>
  }
}

DatasetSummary.propTypes = {dataset: React.PropTypes.object};
DatasetSummary.defaultProps = {dataset: {}};
