import React, { Component } from "react";

import CrappyChat from "../Components/CrappyChat/CrappyChat";
import "./RecordDetails.css";

export default class DatasetDiscussion extends Component {
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
