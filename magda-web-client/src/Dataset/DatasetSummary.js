//  @flow
import React, { Component } from 'react';
import MarkdownViewer from '../UI/MarkdownViewer';
import defined from '../helpers/defined';
// import Star from '../UI/Star';
import ToggleList from '../UI/ToggleList';
import QualityIndicator from '../UI/QualityIndicator';
import renderDistribution from '../UI/Distribution';
import './DatasetSummary.css';
import { Link } from 'react-router';

type Props = {
  onClickTag: Function,
  onClickDataset: Function,
  dataset: Object,
  isExpanded: boolean
}

export default class DatasetSummary extends Component {
  state: {
    tagsExpanded: boolean,
    isFav: boolean
  }

  constructor(props: Props) {
    super(props);
    const self: any = this;

    self.onClick = this.onClick.bind(this);
    // self.onClickStar = this.onClickStar.bind(this);
    this.state ={
      tagsExpanded: false,
      isFav: false
    }
  }

  onClick(tag: string, e: Event){
    e.stopPropagation();
    this.props.onClickTag(tag);
  }

  renderLinks(dataset: Object){
    return <div className='dataset-summary__more-info'>
              <div className='dataset-summary__content clearfix'>
                <h5 className='dataset-summary__sub-heading'>Contents</h5>
                <ToggleList list={dataset.distributions}
                            renderFunction={item=>renderDistribution(item, dataset.identifier, false)}
                            className={''}
                            defaultLength={3}
                            getKey={item=>item.downloadURL}/>
              </div>
           </div>
  }


  render(){
    let dataset = this.props.dataset;
    let onClickDataset = this.props.onClickDataset;
    let isExpanded = this.props.isExpanded;
    if(this.props.params.datasetpreviewjson){
      dataset = JSON.parse(this.props.params.datasetpreviewjson);
      onClickDataset= ()=>{};
      isExpanded = true;
    }
    const publisher = dataset.publisher && dataset.publisher.name;
    const source = dataset.catalog;


     if(dataset.error){
       return <div className='error dataset-summary'><div className='dataset-summary__body'>{dataset.error}</div></div>
     }
    return <div className={`dataset-summary ${isExpanded ? 'is-expanded': ''}`}>
                <div className='dataset-summary__header'>
                  <div className='dataset-summary__header-top clearfix'>
                    <div className='dataset-summary__title-group'>
                      <Link className='dataset-summary__title btn'
                            to={`/dataset/${encodeURIComponent(dataset.identifier)}`}>
                        {dataset.title}
                      </Link>

                      <label className='dataset-summary-publisher'>{publisher}</label>
                    </div>
                    <span className='hidden-xs dataset-summary__toggle'>
                        { onClickDataset && <button className='dataset-summary__toggle-info-btn' onClick={onClickDataset} type='button'>{isExpanded ? <span>Close</span> : <i className='fa fa-ellipsis-h' aria-hidden='true'></i>}</button>}
                    </span>
                  </div>
                  {isExpanded && <div className='dataset-summary__middle clearfix'>
                      <div>
                        <Link className='btn dataset-summary__btn-view-dataset'
                                   to={`/dataset/${encodeURIComponent(dataset.identifier)}`}>View dataset</Link>
                        {dataset.landingPage && <a className='btn dataset-summary__btn-go-to-source' href={dataset.landingPage}>Go to Source</a>}
                      </div>
                  </div>}
                </div>
                <div className='dataset-summary__body'>

                  <div className='dataset-summary__dataset-description' onClick={onClickDataset}>
                    <MarkdownViewer markdown={isExpanded ? dataset.description : dataset.description.slice(0, 100) + '...'}/>
                  </div>

                  <label className='dataset-summary-source'>Source: {source}</label>
                  <label className='dataset-summary-quality'>{defined(dataset.quality) && <QualityIndicator quality={dataset.quality}/>}</label>

                </div>
              {onClickDataset && <div className='dataset-summary__footer'>
                  {isExpanded && this.renderLinks(dataset)}
                  <div className='dataset-summary__mobile-footer visible-xs clearfix'>
                    <button className='dataset-summary__toggle-info-btn mobile'
                                                       onClick={onClickDataset}
                                                       type='button'>
                        {isExpanded ? <span>Close</span> : <i className='fa fa-ellipsis-h' aria-hidden='true'></i>}
                    </button>
                  </div>
              </div>}
          </div>
  }
}
