//@flow
import React from 'react';
import {config} from '../config';
import './Social.css';


export default class Social extends React.Component {
  render() {
    const url: string = window.location.href;
    return (
      <div className='social'>
        <div>
          <a className='twitter-share-button btn btn-default' href={`https://twitter.com/intent/tweet?url=${url}`}
          data-size='large'><i className='fa fa-twitter' aria-hidden='true'></i>Tweet</a>
        </div>
      </div>
    );
  }
}
