import React from 'react';
import './Notification.css';

function Notification(props) {
  return (
    <div className={`notification notification__${props.type}`}>
              <div className='notification__inner'>
                <div className='notification__heading'>{props.content.title}</div>
                <div className='notification__body'>{props.content.detail}</div>
                <button className='btn notification__dismiss-btn'
                        onClick={props.onDismiss}>
                        Dismiss
                </button>
              </div>
           </div>
  );
}

Notification.defaultProps = {content: {title: '', detail: 'unknown error occurred'}, type: ''};

export default Notification;
