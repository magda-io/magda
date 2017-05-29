import React from 'react';
import {contents} from '../content/register';
import {config} from '../config.js';
import ReactDocumentTitle from "react-document-title";


export default class StaticPage extends React.Component {
  render() {
    const id = this.props.params.id;
    const content = contents.get(id);
    return (
      <ReactDocumentTitle title={config.appName + "|" + id}>
      <div className="container">
        <div className="row">
          <div className='col-sm-8'>
            <h1> {content.title} </h1>
            <div className='markdown-body' dangerouslySetInnerHTML={{__html: content.__content}}/>
          </div>
        </div>
      </div>
      </ReactDocumentTitle>
    );
  }
}
