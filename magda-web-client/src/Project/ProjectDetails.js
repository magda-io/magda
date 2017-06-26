//@flow
import React, { Component } from "react";
import { connect } from "react-redux";
import { config } from "../config.js";
import { Link } from "react-router";
import { bindActionCreators } from "redux";
import { fetchProjectIfNeeded } from "../actions/projectActions";
import ReactDocumentTitle from "react-document-title";
import ErrorHandler from "../Components/ErrorHandler";
import ProgressBar from "../UI/ProgressBar";
import CrappyChat from "../Components/CrappyChat/CrappyChat";

class ProjectDetails extends Component {
  componentWillMount() {
    this.props.fetchProjectIfNeeded(this.props.params.projectId);
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.params.projectId !== nextProps.params.projectId) {
      this.props.fetchProjectIfNeeded(nextProps.params.projectId);
    }
  }

  render() {
    if (this.props.error) {
      return <ErrorHandler errorCode={this.props.error} />;
    } else if (!this.props.isFetching && this.props.project) {
      return (
        <ReactDocumentTitle
          title={this.props.project.name + "|" + config.appName}
        >
          <div className="project-details container">
            <div className="row">
              <div className="col-sm-8">
                {this.props.showNotification &&
                  <div className="success-message">
                    Project successfully created
                  </div>}
                <h1>{this.props.project.name}</h1>
                  <div className={`project-status ${this.props.project.status}`}>{this.props.project.status}</div>
                  <h3 className='section-heading'> Description </h3>
                <div className="white-box">
                  {this.props.project.description}
                </div>
                <div className="">
                  <h3 className='section-heading'> Discussion</h3>
                  <CrappyChat typeName="project" typeId={this.props.project.id} />
                </div>
              </div>
              <div className="col-sm-4">
                <Link className="btn btn-primary" to="/project/new">
                  {" "}Create new project
                  {" "}
                </Link>
              </div>
            </div>
          </div>
        </ReactDocumentTitle>
      );
    }
    return <ProgressBar />;
  }
}

function mapDispatchToProps(dispatch) {
  return bindActionCreators(
    {
      fetchProjectIfNeeded: fetchProjectIfNeeded
    },
    dispatch
  );
}

function mapStateToProps(state, ownProps) {
  const project = state.project.project;
  const isFetching = state.project.isFetching;
  const error = state.project.error;
  const location = ownProps.location;
  const showNotification = state.project.showNotification;
  return {
    project,
    isFetching,
    location,
    error,
    showNotification
  };
}

export default connect(mapStateToProps, mapDispatchToProps)(ProjectDetails);
