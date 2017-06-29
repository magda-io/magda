// @flow
import React from 'react';
import { Link } from 'react-router';
import './PublisherBox.css'



export default function PublisherBox(props: Object){
  const publisher = props.publisher;
  return (
    <div className='white-box publisher-box'>
      <div className='inner'>
        <h3><Link to={`publishers/${encodeURIComponent(publisher.id)}`}>{publisher.name}</Link></h3>
        <div className=''>{publisher['description']}</div>
        <Link to={`/search?publisher=${encodeURIComponent(publisher.name)}&q=${encodeURIComponent('*')}`}>View all datasets</Link>
      </div>
  </div>
  )
}
