import React from 'react';
import ReactDocumentTitle from 'react-document-title';
import {config} from '../config' ;


export default function Contact(props) {
  function renderField(id, type){
    return (<div className="form-group">
      <label for={id}>{id}</label>
      <input type={type} className="form-control" id={id}/>
    </div>);
  }

  return (
  <ReactDocumentTitle title={config.appName + ' | contact'}>
    <div className='container contact'>
      <h1>Get in contact with the team that runs {config.appName}</h1>
      <form>
        {renderField('name', 'text')}
        {renderField('email', 'email')}
        {renderField('comment', 'textarea')}
        <button type="submit" className="btn btn-default">Send</button>
      </form>
    </div>
    </ReactDocumentTitle>
  );
}
