
//@flow
import React, { Component } from 'react';
import { Link } from 'react-router';
import "./PublisherSummary.css";

class PublisherSummary extends Component {
    render(){
      return <div className="publisher-summray white-box media">
                <div className="media-left">
                    <img className="media-object publisher_image" src={this.props.publisher.image_url} alt={this.props.publisher.title}/>
                </div>
                <div className="media-body">
                    <Link to={"publishers/" + encodeURI(this.props.publisher.id)}><h3>{this.props.publisher.title}</h3></Link>
                    <div className='publisher-description'>{this.props.publisher.description.slice(0, 200) + "..."}</div>
                </div>
             </div>
    }
}

PublisherSummary.propTypes = {publisher: React.PropTypes.object};


export default PublisherSummary;
