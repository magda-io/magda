import React, { Component } from 'react';
import { Link } from 'react-router';
import './ProjectSummary.css';

class ProjectSummary extends Component {
    render(){
      return <div className='project-summray white-box'>
                <div className='project-summray__inner'>
                    <h3 className='project-title'><Link to={'projects/' + encodeURIComponent(this.props.project.id)}>{this.props.project.name}</Link></h3>
                    <div className={`project-status ${this.props.project.status}`}>{this.props.project.status}</div>
                    <div className='project-description'>{this.props.project.description}</div>
                </div>
             </div>
    }
}



export default ProjectSummary;
