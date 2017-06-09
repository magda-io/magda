import React, { Component } from 'react';
import { Link } from 'react-router';
import './ProjectSummary.css';

class ProjectSummary extends Component {
    render(){
      return <div className='project-summray white-box'>
                <div className=''>
                    <Link to={'projects/' + encodeURI(this.props.project.id)}><h3>{this.props.project.name}</h3></Link>
                    <div className='project-description'>{this.props.project.description}</div>
                </div>
             </div>
    }
}



export default ProjectSummary;
