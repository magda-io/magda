import React from 'react';
import './Notification.css';
import close from "../assets/close.svg";
import Button from 'muicss/lib/react/button';


function Notification(props) {
  return (
    <div className={`notification notification__${props.type}`}>
              <div className='notification__inner'>
                <div className={`notification__header ${props.icon ? 'with-icon': ''}`}>
                  {props.icon && <img className='status-icon' alt={props.type} src={props.icon}/>}
                  <span>{props.content.title}</span>
                  <Button onClick={props.onDismiss} className='close-btn'>
                          <img alt='close' src={close}/>
                  </Button>
                </div>
                <div className='notification__body'>{props.content.detail}</div>

              </div>
           </div>
  );
}

Notification.defaultProps = {content: {title: '', detail: ''}, type: ''};

export default Notification;
