import React, { Component } from 'react';
class ProjectDetails extends Component {
    render(){
      return <div className="project-details container">
                <h1>{this.props.params.id}</h1>
                <p>Some description of the project</p>
             </div>
    }
}

ProjectDetails.propTypes = {project: React.PropTypes.array};


export default ProjectDetails;
