import React, { Component } from 'react';
import { Link } from 'react-router';
import './ProjectSummary.css';

function ProjectSummary(props) {
  return (
      <div className='project-summray white-box'>
                <div className='project-summray__inner'>
                    <h3 className='project-title'><Link to={'projects/' + encodeURIComponent(props.project.id)}>{props.project.name}</Link></h3>
                    <div className={`project-status ${props.project.status}`}>{props.project.status}</div>
                    <div className='project-description'>{props.project.description}</div>
                </div>
             </div>
  );
}



export default ProjectSummary;
