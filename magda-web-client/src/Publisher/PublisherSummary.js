
//@flow
import React, { Component } from 'react';
import { Link } from 'react-router';
import './PublisherSummary.css';

function PublisherSummary(props) {
  return (
      <div className='publisher-summray white-box media'>
                <div className='media-left'>
                    <img className='media-object publisher_image' src={props.publisher.image_url} alt={props.publisher.name}/>
                </div>
                <div className='media-body'>
                    <Link to={'publishers/' + encodeURIComponent(props.publisher.id)}><h3>{props.publisher.name}</h3></Link>
                    <div className='publisher-description'>{props.publisher.description.slice(0, 200) + '...'}</div>
                </div>
             </div>
  );
}



export default PublisherSummary;
