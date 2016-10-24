import React, { Component } from 'react';
import './DatasetSummary.css';

class DatasetSummary extends Component {
  let dataset = this.props.dataset;

  return <li key={dataset.title} className='dataset-summray'>
            <h3 className='result-title'><a href={dataset.landingPage}>{dataset.title}</a></h3>
            {defined(dataset.publisher) && <label className='search-result--publisher'><i className='fa fa-book' aria-hidden='true'></i>{dataset.publisher.name}</label>}
            <p>{this.truncate(dataset.description)}</p>
            <ul className='list-unstyled tags'>
              {
                dataset.keyword.map((tag)=>
                  <li key={tag} className='search-result--tag'><a href={`/?q=${tag}`}>#{tag}</a></li>
                )
              }
            </ul>
        </li>
}

DatasetSummary.propTypes = {dataset: React.PropTypes.object};
DatasetSummary.defaultProps = {dataset: {}};
