
//@flow
import React from 'react';
import { Link } from 'react-router-dom';
import './PublisherSummary.css';
import type {Publisher} from '../../helpers/record';

function PublisherSummary(props: {publisher: Publisher}) {
  const details = props.publisher.aspects['organization-details'];
  return (
      <div className='publisher-summray white-box media'>
                <div className='media-left'>
                    <img className='media-object publisher_image' src={details.imageUrl ? details.imageUrl : 'http://via.placeholder.com/200x150?text=no+logo+available'} alt={props.publisher.name}/>
                </div>
                <div className='media-body'>
                    <Link to={'publishers/' + encodeURIComponent(props.publisher.id)}><h3>{props.publisher.name}</h3></Link>
                    <div className='publisher-description'>{details.description && details.description.slice(0, 200) + '...'}</div>
                </div>
             </div>
  );
}



export default PublisherSummary;
