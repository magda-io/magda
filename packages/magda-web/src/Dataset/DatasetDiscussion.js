import React, { Component } from 'react';
import defined from '../helpers/defined';
import MarkdownViewer from '../UI/MarkdownViewer';
import Star from '../UI/Star';
import { Link } from 'react-router';

export default class DatasetDiscussion extends Component {
  render(){
    let dataset = this.props.dataset;
    return <div className="dataset-details container" >
                discussion
          </div>
  }
}

DatasetDiscussion.propTypes = {dataset: React.PropTypes.object};
