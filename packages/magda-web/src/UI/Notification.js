import React, { Component } from 'react';
import './Notification.css';
class Notification extends Component {
    render(){
      return <div className={`notification notification__${this.props.type}`}>
                <div className='notification__inner'>
                  <div className='notification__heading'>{this.props.type}</div>
                  <div className='notification__body'>{this.props.content}</div>
                  <button className='btn notification__dismiss-btn'
                          onClick={this.props.onDismiss}>
                          Dismiss
                  </button>
                </div>
             </div>
    }
}

Notification.propTypes = {content: React.PropTypes.string,
                          type: React.PropTypes.string,
                          onDismiss: React.PropTypes.func};
Notification.defaultProps = {content: '', type: ''};

export default Notification;
