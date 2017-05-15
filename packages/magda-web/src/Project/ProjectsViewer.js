import React, { Component } from 'react';
import { connect } from "react-redux";
import {config} from '../config.js';
import { bindActionCreators } from "redux";
import { fetchProjectsIfNeeded } from '../actions/projectActions';
import ProjectSummary from './ProjectSummary';
import Pagination from '../UI/Pagination';
import ErrorHandler from '../Components/ErrorHandler';


import './ProjectsViewer.css';
class ProjectsViewer extends Component {
    componentWillMount(){
      this.props.fetchProjectsIfNeeded(this.props.location.query.page || 1);
    }
    
    componentWillReceiveProps(nextProps){
      if(this.props.location.query.page !== nextProps.location.query.page){
        nextProps.fetchProjectsIfNeeded(nextProps.location.query.page || 1);
      }
    }

    renderContent(){
      if(this.props.error){
        return <ErrorHandler errorCode={this.props.error}/>
      }
      return (<div>
                {this.props.projects.map(p=>
                <ProjectSummary project={p} key={p.id}/>)}
                {this.props.hitCount > config.resultsPerPage &&
                  <Pagination
                    currentPage={+this.props.location.query.page || 1}
                    maxPage={Math.ceil(this.props.hitCount/config.resultsPerPage)}
                    location={this.props.location}
                  />
                }
              </div>);
    }

    render(){
      return <div className="container projects-viewer">
              {!this.props.isFetching && this.renderContent()}
             </div>
    }
}

ProjectsViewer.propTypes = {projects: React.PropTypes.array,
                            isFetching: React.PropTypes.bool,
                            error: React.PropTypes.string};

function mapDispatchToProps(dispatch) {
  return bindActionCreators({
    fetchProjectsIfNeeded: fetchProjectsIfNeeded,
  }, dispatch);
}

function mapStateToProps(state, ownProps) {
  const projects= state.project.projects;
  const isFetching= state.project.isFetching;
  const hitCount= state.project.hitCount;
  const error = state.project.error;
  const location = ownProps.location;
  return {
    projects, isFetching, hitCount, location, error
  };
}


export default connect(mapStateToProps, mapDispatchToProps)(ProjectsViewer);
