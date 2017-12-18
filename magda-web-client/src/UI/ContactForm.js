import React from 'react';
import Button from 'muicss/lib/react/button';
import Form from 'muicss/lib/react/form';
import Input from 'muicss/lib/react/input';
import Textarea from 'muicss/lib/react/textarea';

export default function Contact(props) {
  function renderField(id, type){
    return (
      <Input type={type} id={id} label={id} required={true} />
    );
  }

  return (
    <Form>
      <Input label='Name' required={true} floatingLabel={true}/>
      <Input label="Email" type="email" floatingLabel={true} required={true} />
      <Textarea label="comments" floatingLabel={true} required={true} />
      <Button variant="raised">Submit</Button>
    </Form>
  );
}
