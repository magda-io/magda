import React from 'react';
import './Social.css';


export default class Social extends React.Component {
  render() {
    return (
      <div className="social">
        <div><button className='btn btn-default'><i className="fa fa-star" aria-hidden="true"></i>Star<span className="count">0</span></button></div>
        <div><button className='btn btn-default'><i className="fa fa-rss" aria-hidden="true"></i>Subscribe<span className="count">0</span></button></div>
        <div><button className='btn btn-default'><i className="fa fa-share-alt" aria-hidden="true"></i>Share<span className="count">0</span></button></div>
      </div>
    );
  }
}
