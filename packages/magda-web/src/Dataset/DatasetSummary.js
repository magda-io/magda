//  @flow
import React, { Component } from 'react';
import defined from '../helpers/defined';
import MarkdownViewer from '../UI/MarkdownViewer';
import CustomIcons from '../UI/CustomIcons';
import Star from '../UI/Star';
import ToggleList from '../UI/ToggleList';
import renderDistribution from '../UI/Distribution';
import './DatasetSummary.css';
import { Link } from 'react-router';

type Props = {
  onClickTag: Function,
  onClickDataset: Function,
  dataset: Object,
  isExpanded: boolean
}

type DefaultProps = {
  datasets: Object
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
    self.onClickStar = this.onClickStar.bind(this);
    this.state ={
      tagsExpanded: false,
      isFav: false
    }
  }

  onClick(tag: string, e: Event){
    e.stopPropagation();
    this.props.onClickTag(tag);
  }


  onClickStar(){
    this.setState({
      isFav: !this.state.isFav
    })
  }



  renderLinks(){
    const distribution = this.props.dataset.distributions;
    return <div className='dataset-summary__more-info'>
              <div className='dataset-summary__source clearfix'>
              <h5 className='dataset-summary__sub-heading'>Source</h5>
                  {this.props.dataset.catalog}
              </div>
              <div className='dataset-summary__content clearfix'>
                <h5 className='dataset-summary__sub-heading'>Contents</h5>
                <ToggleList list={this.props.dataset.distributions}
                            renderFunction={item=>renderDistribution(item.format, item.id, item.title, item.license.name, this.props.dataset.identifier)}
                            className={''}
                            defaultLength={3}
                            getKey={item=>item.downloadURL}/>
              </div>
           </div>
  }

  render(){
    let dataset = this.props.dataset;
    return <div className={`dataset-summary ${this.props.isExpanded ? 'is-expanded': ''}`}>
                <div className='dataset-summary__header'>
                  <div className='dataset-summary__header-top clearfix'>
                    <div className='dataset-summary__title-group'>
                      <Link className='dataset-summary__title btn'
                            to={`/dataset/${dataset.identifier}`}>
                        {dataset.title}
                      </Link>
                    </div>
                    <span className='hidden-xs dataset-summary__toggle'>
                        {!this.props.isExpanded && <Star onClick={this.onClickStar} isOn={this.state.isFav}/>}
                        {this.props.onClickDataset && <button className='dataset-summary__toggle-info-btn' onClick={this.props.onClickDataset} type='button'>{this.props.isExpanded ? <span>Close</span> : <i className="fa fa-ellipsis-h" aria-hidden="true"></i>}</button>}
                    </span>
                  </div>
                  {this.props.isExpanded && <div className='dataset-summary__middle clearfix'>
                      <div><Link className='btn dataset-summary__btn-view-dataset'
                                 to={`/dataset/${dataset.identifier}`}>View dataset</Link></div>
                      <div><Star onClick={this.onClickStar} isOn={this.state.isFav}/></div>
                      <div>
                        <a className='btn dataset-summary__btn-share' href={``} target='_blank'>
                          <i className="fa fa-share-alt" aria-hidden="true"></i>
                        </a>
                      </div>
                  </div>}
                </div>
                <div className='dataset-summary__body'>

                  <div className='dataset-summary__dataset-description' onClick={this.props.onClickDataset}>
                    <MarkdownViewer markdown={this.props.isExpanded ? dataset.description : dataset.description.slice(0, 100) + "..."}/>
                  </div>
                  <label className='dataset-summary__search-result--publisher'>{defined(dataset.publisher) ? dataset.publisher.name : 'unspecified'}</label>
                </div>
              <div className='dataset-summary__footer'>
                  {this.props.isExpanded && this.renderLinks()}
                  <div className='dataset-summary__mobile-footer visible-xs clearfix'>
                    <button className='dataset-summary__toggle-info-btn mobile'
                                                       onClick={this.props.onClickDataset}
                                                       type='button'>
                        {this.props.isExpanded ? <span>Close</span> : <i className="fa fa-ellipsis-h" aria-hidden="true"></i>}
                    </button>
                  </div>
              </div>
          </div>
  }
}
