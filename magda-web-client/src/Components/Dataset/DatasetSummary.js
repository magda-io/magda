//  @flow
import React, { Component } from 'react';
import MarkdownViewer from '../../UI/MarkdownViewer';
import defined from '../../helpers/defined';
import ToggleList from '../../UI/ToggleList';
import QualityIndicator from '../../UI/QualityIndicator';
import renderDistribution from '../../Components/Distribution';
import './DatasetSummary.css';
import { Link } from 'react-router-dom';
import Button from 'muicss/lib/react/button';
import Divider from 'muicss/lib/react/divider';

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
    this.state ={
      tagsExpanded: false,
      isFav: false
    }
  }

  onClick(tag: string, e: Event){
    e.stopPropagation();
    this.props.onClickTag(tag);
  }

  renderLinks(){
    return <div className='dataset-summary__more-info'>
              <div className='dataset-summary__content clearfix'>
                <h5 className='dataset-summary__sub-heading'>Contents</h5>
                <ToggleList list={this.props.dataset.distributions}
                            renderFunction={item=>renderDistribution(item, this.props.dataset.identifier, false)}
                            className={''}
                            defaultLength={3}
                            getKey={item=>item.downloadURL}/>
              </div>
           </div>
  }

  render(){
    const dataset = this.props.dataset;
    const publisher = dataset.publisher && dataset.publisher.name;
    const source = this.props.dataset.catalog;

     if(dataset.error){
       return <div className='error dataset-summary'><div className='dataset-summary__body'>{dataset.error}</div></div>
     }
    return <div className={`dataset-summary mui-panel ${this.props.isExpanded ? 'is-expanded ': ''}`}>
                <div className='dataset-summary__header'>
                  <div className='dataset-summary__header-top clearfix'>
                    <div className='dataset-summary__title-group'>
                      <h3><Link
                            to={`/dataset/${encodeURIComponent(dataset.identifier)}`}>
                        {dataset.title}
                      </Link></h3>
                      {publisher && <span className='dataset-summary-publisher'>{publisher}</span>}
                    </div>
                    <span className='hidden-xs dataset-summary__toggle'>
                        {this.props.onClickDataset && <Button onClick={this.props.onClickDataset}><span className='sr-only'>Toggle more info</span>{this.props.isExpanded ? <span>Close</span> : <i className='fa fa-ellipsis-h' aria-hidden='true'></i>}</Button>}
                    </span>
                  </div>
                  {this.props.isExpanded &&
                   <div className='dataset-summary__middle clearfix'>
                      <div>
                        <Link className='mui-btn mui-btn--primary'
                                   to={`/dataset/${encodeURIComponent(dataset.identifier)}`}>View dataset</Link>
                        {dataset.landingPage && <a className='mui-btn mui-btn--accent ' href={dataset.landingPage}>Go to Source</a>}
                      </div>
                      <Divider />
                  </div>}
                </div>
                <div className='dataset-summary__body'>

                  <div className='dataset-summary__dataset-description' onClick={this.props.onClickDataset}>
                    <MarkdownViewer markdown={dataset.description}/>
                  </div>

                  {source && <span className='dataset-summary-source'>Source: {source}</span>}
                  {defined(dataset.quality) && <span className='dataset-summary-quality'> <QualityIndicator quality={dataset.quality}/></span>}
                </div>
          </div>
  }
}
