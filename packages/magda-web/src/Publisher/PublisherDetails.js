import React, { Component } from 'react';
import "./PublisherDetails.css";

class PublisherDetails extends Component {
    
    render(){
      return <div className="publisher-details container">
                <h1>{this.props.params.id}</h1>
                <p>Some description of the publisher</p>
             </div>
    }
}



export default PublisherDetails;
