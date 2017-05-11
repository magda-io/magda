import React, { Component } from "react";
import defined from "../helpers/defined";
import MarkdownViewer from "../UI/MarkdownViewer";
import Star from "../UI/Star";
import { Link } from "react-router";
import CrappyChat from '../Components/CrappyChat/CrappyChat'


export default class DatasetDiscussion extends Component {
  constructor(props) {
    super(props);
  }


  render() {
    return (
      <div className="dataset-details container">
        <CrappyChat datasetId={this.props.params.datasetId} />
      </div>
    );
  }
}

DatasetDiscussion.propTypes = { dataset: React.PropTypes.object };
