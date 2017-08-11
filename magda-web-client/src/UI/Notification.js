import React, { Component } from 'react';
import './Notification.css';

function Notification(props) {
  return (
    <div className={`notification notification__${props.type}`}>
              <div className='notification__inner'>
                <div className='notification__heading'>{props.type}</div>
                <div className='notification__body'>{props.content}</div>
                <button className='btn notification__dismiss-btn'
                        onClick={props.onDismiss}>
                        Dismiss
                </button>
              </div>
           </div>
  );
}

Notification.defaultProps = {content: '', type: ''};

export default Notification;
