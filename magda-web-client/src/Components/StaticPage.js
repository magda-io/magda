import React from 'react';
import {contents} from '../content/register';
import {config} from '../config' ;
import ReactDocumentTitle from 'react-document-title';

export default function StaticPage(props) {
  const id = props.match.params.id;
  const content = contents.get(id);
  return (
    <ReactDocumentTitle title={id + ' | ' + config.appName}>
    <div className='container'>
      <div className='row'>
        <div className='col-sm-8'>
          <h1> {content.title} </h1>
          <div className='markdown-body' dangerouslySetInnerHTML={{__html: content.__content}}/>
        </div>
      </div>
    </div>
    </ReactDocumentTitle>
  );
}
