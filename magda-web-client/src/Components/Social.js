//@flow
import React from 'react';
import './Social.css';


export default function Social() {
  const url: string = window.location.href;
  return (
    <div className='social'>
      <div>
        <a className='twitter-share-button mui-btn mui-btn--primary' href={`https://twitter.com/intent/tweet?url=${url}`}
        data-size='large'><i className='fa fa-twitter' aria-hidden='true'></i>Tweet</a>
      </div>
    </div>
  );
}
