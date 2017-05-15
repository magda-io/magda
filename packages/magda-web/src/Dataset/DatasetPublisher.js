import React, { Component } from 'react';

export default class DatasetPublisher extends Component {
  render(){
    return <div className="dataset-publisher container" >
                about this publisher
          </div>
  }
}

DatasetPublisher.propTypes = {dataset: React.PropTypes.object};
