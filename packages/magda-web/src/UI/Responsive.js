import React from 'react';
import MediaQuery from 'react-responsive';
import {config} from '../config.js';

export class ExtraSmall extends React.Component{
  render() {
    return (
      <MediaQuery maxWidth={config.breakpoints.small-1}>{this.props.children}</MediaQuery>
    );
  }
}


export class Small extends React.Component{

  render() {
    return (
      <MediaQuery minWidth={config.breakpoints.small}>{this.props.children}</MediaQuery>
    );
  }
}

export class Medium extends React.Component {
  render() {
    return (
      <MediaQuery minWidth={config.breakpoints.medium}>{this.props.children}</MediaQuery>
    );
  }
}

export class Large extends React.Component {
  render() {
    return (
      <MediaQuery minWidth={config.breakpoints.large} component='div' >{this.props.children}</MediaQuery>
    );
  }
}
