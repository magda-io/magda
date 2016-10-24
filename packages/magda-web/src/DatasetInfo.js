import React, { Component } from 'react';
import './DatasetInfo.css';

class DatasetInfo extends Component {
  return <div className='dataset-info'>

            <div className='dataset-info-inner'>
              <div className='dataset-info--content'>
              <label>Contents</label>
                <ul className='list-unstyled'>
                  {}
                </ul>
              </div>
              <div className='dataset-info--licence'>
                  Creative Commons Attribution 3.0 Australia
              </div>
            </div>

            <div className='dataset-info-footer clearfix'>
                <label>Licence</label>
                <div className='dataset-info-footer--left col-sm-8'>
                  <button className='btn'><i className="fa fa-star" aria-hidden="true"></i></button>
                  <button className='btn'><i className="fa fa-share-alt" aria-hidden="true"></i></button>
                </div>
                <div className='dataset-info-footer--right col-sm-4'>
                  <button className='btn'>View dataset</button>
                </div>
            </div>
         </div>
}

DatasetInfo.propTypes = {isOpen: React.PropTypes.bool,
                         dataset: React.PropTypes.object};
DatasetInfo.defaultProps = {isOpen: false};
