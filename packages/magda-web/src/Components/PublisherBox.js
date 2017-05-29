// @flow
import React, { Component } from 'react';
import { Link } from 'react-router';



export default function PublisherBox(props: Object){
  const publisher = props.publisher;
  return (
    <div className="white-box publisherbox">
      <div className="inner">
        <h3><Link to={`publishers/${publisher.id}`}>{publisher.title}</Link></h3>
        <div className="">{publisher.description}</div>
      </div>
  </div>
  )
}
