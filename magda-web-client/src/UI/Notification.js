import React from 'react';
import './Notification.css';
import Button from 'muicss/lib/react/button';


function Notification(props) {
  return (
    <div className={`notification notification__${props.type}`}>
              <div className='notification__inner'>
                <div className='notification__heading'>{props.content.title}</div>
                <div className='notification__body'>{props.content.detail}</div>
                <Button onClick={props.onDismiss}>
                        Dismiss
                </Button>
              </div>
           </div>
  );
}

Notification.defaultProps = {content: {title: '', detail: ''}, type: ''};

export default Notification;
