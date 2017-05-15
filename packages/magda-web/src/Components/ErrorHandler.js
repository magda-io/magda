import React from 'react';

export default class ErrorHandler extends React.Component {
  render() {
    return (
      <div className="container">
        <h2>{this.props.errorCode}</h2>
      </div>
    );
  }
}




