//@flow
import React, { Component } from "react";
import { connect } from "react-redux";
import { config } from "../../config.js";
import { Link } from "react-router-dom";
import { bindActionCreators } from "redux";
import { fetchProjectIfNeeded, updateProjectStatus } from "../../actions/projectActions";
import ReactDocumentTitle from "react-document-title";
import ErrorHandler from "../../Components/ErrorHandler";
import ProgressBar from "../../UI/ProgressBar";
import CrappyChat from "../../Components/CrappyChat/CrappyChat";

class ProjectDetails extends Component {
  componentWillMount() {
    this.props.fetchProjectIfNeeded(this.props.params.projectId);
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.params.projectId !== nextProps.params.projectId) {
      this.props.fetchProjectIfNeeded(nextProps.params.projectId);
    }
  }

  renderToggleButton(){
    if(this.props.user && this.props.user.isAdmin){
      return <button className='project-status-toggle btn btn-primary' onClick={()=>this.props.updateProjectStatus(this.props.project)}>{this.props.project.status === 'open' ? 'Close project' : 'Open project'}</button>
    }
      return null
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
                <h3 className='section-heading'> Discussion </h3>
                <CrappyChat typeName="project" typeId={this.props.project.id} />
                {this.renderToggleButton()}
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

const mapDispatchToProps = (dispatch: Dispatch<*>)=>{
  return bindActionCreators(
    {
      fetchProjectIfNeeded: fetchProjectIfNeeded,
      updateProjectStatus: updateProjectStatus
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
  const user = state.userManagement.user;
  return {
    project,
    isFetching,
    location,
    error,
    showNotification,
    user
  };
}

export default connect(mapStateToProps, mapDispatchToProps)(ProjectDetails);
