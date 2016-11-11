import React, { Component } from 'react';
import defined from '../helpers/defined';
import MarkdownViewer from '../UI/MarkdownViewer';
import './DatasetSummary.css';

export default class DatasetSummary extends Component {
  truncate(s) {
    return s.substring(0,200) + '...';
  }

  render(){
    let dataset = this.props.dataset;
    return <div className='dataset-summray'>
              <div className='dataset-summray-main'>
                <h3 className='result-title'><button className='btn dataset-summray-title' onClick={this.props.clickDataset} type='button'>{dataset.title}</button></h3>
                {defined(dataset.publisher) && <label className='search-result--publisher'>{dataset.publisher.name}</label>}
                <div className='dataset-description'>
                  <MarkdownViewer markdown={dataset.description}/>
                </div>
                <ul className='list-unstyled tags'>
                  {
                    dataset.keyword.map((tag)=>
                      <li key={tag} className='search-result--tag'><a href={`/?q=${tag}`}>#{tag}</a></li>
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
