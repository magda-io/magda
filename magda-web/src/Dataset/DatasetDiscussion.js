import React, { Component } from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";

import { fetchDiscussionForType } from "../actions/discussionActions";
import CrappyChat from "../Components/CrappyChat/CrappyChat";
import "./RecordDetails.css";

export default class DatasetDiscussion extends Component {
  constructor(props) {
    super(props);
  }

  render() {
    return (
      <div className="dataset-discussion container">
        <div className="row">
          <div className="col-sm-8">
            <CrappyChat
              typeName="dataset"
              typeId={this.props.params.datasetId}
            />
          </div>
        </div>
      </div>
    );
  }
}