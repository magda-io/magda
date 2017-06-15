import React, { Component } from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";

import { fetchDiscussionForType } from "../actions/discussionActions";
import CrappyChat from "../Components/CrappyChat/CrappyChat";
import "./RecordDetails.css";

class DatasetDiscussion extends Component {
  constructor(props) {
    super(props);

    this.state = {
      discussionId: null
    };
  }

  componentWillMount() {
    this.setup(this.props);
  }

  componentWillReceiveProps(newProps) {
    this.setup(newProps);
  }

  setup(props) {
    const discussionForDataset =
      props.datasetDiscussions[props.params.datasetId];

    if (discussionForDataset) {
      this.setState({
        discussionId: discussionForDataset.id
      });
    } else {
      props.fetchDiscussionForType("dataset", props.params.datasetId);
    }
  }

  render() {
    return (
      <div className="dataset-discussion container">
        <div className="row">
          <div className="col-sm-8">
            {this.state.discussionId &&
              <CrappyChat discussionId={this.state.discussionId} />}
          </div>
        </div>
      </div>
    );
  }
}

function mapStateToProps(state) {
  let {
    discussions: {
      discussionsForType: { dataset: datasetDiscussions = {} } = {}
    }
  } = state;

  return {
    datasetDiscussions
  };
}

const mapDispatchToProps = (dispatch: Dispatch<*>) => {
  return bindActionCreators(
    {
      fetchDiscussionForType
    },
    dispatch
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(DatasetDiscussion);
