import React, { Component } from 'react';
import { Link } from 'react-router';
import "./ProjectSummary.css";

class ProjectSummary extends Component {
    render(){
      return <div className="project-summray white-box">
                <div className="">
                    <Link to={"projects/" + encodeURI(this.props.project.title)}><h3>{this.props.project.title}</h3></Link>
                    <div className='project-description'>{this.props.project.description}</div>
                </div>
             </div>
    }
}

ProjectSummary.propTypes = {project: React.PropTypes.object};


export default ProjectSummary;
