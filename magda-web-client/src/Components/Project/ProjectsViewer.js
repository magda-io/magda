import React, { Component } from "react";
import { connect } from "react-redux";
import { Link } from "react-router-dom";
import { config } from "../../config";
import { bindActionCreators } from "redux";
import { fetchProjectsIfNeeded } from "../../actions/projectActions";
import ReactDocumentTitle from "react-document-title";
import ProjectSummary from "./ProjectSummary";
import Pagination from "../../UI/Pagination";
import ErrorHandler from "../../Components/ErrorHandler";
import getPageNumber from "../../helpers/getPageNumber";
import ProgressBar from "../../UI/ProgressBar";
import queryString from "query-string";
import PropTypes from "prop-types";
import "./ProjectsViewer.css";

class ProjectsViewer extends Component {
    componentWillMount() {
        this.props.fetchProjectsIfNeeded(getPageNumber(this.props) || 1);
    }

    componentWillReceiveProps(nextProps) {
        if (getPageNumber(this.props) !== getPageNumber(nextProps)) {
            nextProps.fetchProjectsIfNeeded(getPageNumber(nextProps) || 1);
        }
    }

    onPageChange(i) {
        this.context.router.history.push({
            pathname: this.props.location.pathname,
            search: queryString.stringify(
                Object.assign(queryString.parse(this.props.location.search), {
                    page: i
                })
            )
        });
    }

    renderContent() {
        if (this.props.error) {
            return <ErrorHandler error={this.props.error} />;
        }
        if (this.props.projects.length === 0) {
            return (
                <div>
                    No projects at the moment,{" "}
                    <Link to="/projects/new">create a project</Link>{" "}
                </div>
            );
        }
        return (
            <div>
                {this.props.projects.map(p => (
                    <ProjectSummary project={p} key={p.id} />
                ))}
                {this.props.hitCount > config.resultsPerPage && (
                    <Pagination
                        currentPage={+getPageNumber(this.props) || 1}
                        maxPage={Math.ceil(
                            this.props.hitCount / config.resultsPerPage
                        )}
                        onPageChange={this.onPageChange.bind(this)}
                        totalItems={this.props.hitCount}
                    />
                )}
            </div>
        );
    }

    render() {
        return (
            <ReactDocumentTitle title={"Projects | " + config.appName}>
                <div className="container projects-viewer">
                    {this.props.isFetching && <ProgressBar />}
                    <div className="row">
                        <div className="col-sm-8 projects">
                            <h2 className="sr-only">
                                List of projects available
                            </h2>
                            {!this.props.isFetching && this.renderContent()}
                        </div>
                        <div className="col-sm-4">
                            <Link
                                className="btn btn-primary"
                                to="/projects/new"
                            >
                                {" "}
                                Create new project{" "}
                            </Link>
                        </div>
                    </div>
                </div>
            </ReactDocumentTitle>
        );
    }
}

function mapDispatchToProps(dispatch) {
    return bindActionCreators(
        {
            fetchProjectsIfNeeded: fetchProjectsIfNeeded
        },
        dispatch
    );
}

function mapStateToProps(state, ownProps) {
    const projects = state.project.projects;
    const isFetching = state.project.isFetching;
    const hitCount = state.project.hitCount;
    const error = state.project.error;
    const location = ownProps.location;
    return {
        projects,
        isFetching,
        hitCount,
        location,
        error
    };
}

ProjectsViewer.contextTypes = {
    router: PropTypes.object.isRequired
};

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(ProjectsViewer);
