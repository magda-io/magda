import React from 'react';
import Button from 'muicss/lib/react/button';

export default function Contact(props) {
  function renderField(id, type){
    return (<div className="form-group">
      <label htmlFor={id}>{id}</label>
      <input type={type} className="form-control" id={id}/>
    </div>);
  }

  return (
      <form>
        {renderField('name', 'text')}
        {renderField('email', 'email')}
        {renderField('comment', 'textarea')}
        <Button color="accent">button</Button>
      </form>
  );
}
