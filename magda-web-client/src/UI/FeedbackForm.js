import React from 'react';
import Input from 'muicss/lib/react/input';
import fetch from 'isomorphic-fetch'
import './FeedbackForm.css';
import Button from 'muicss/lib/react/button';
import Textarea from 'muicss/lib/react/textarea';
import feedback from "../assets/feedback.svg";
import close from "../assets/close.svg";
import success from "../assets/success.svg";
import {config} from '../config';
import Notification from './Notification';

export default class FeedbackForm extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isOpen: false,
      isSendingFeedback: false,
      SendFeedbackSuccess: false,
      SendFeedbackError: false,
      name: '',
      email: '',
      feedback: ''
    };
    this.onCancel = this.onCancel.bind(this);
    this.changeValue = this.changeValue.bind(this);
    this.onSubmit = this.onSubmit.bind(this);
    this.onDismissError = this.onDismissError.bind(this);
    this.onDismissSucess = this.onDismissSucess.bind(this);
  }

  onSubmit(){
    this.setState({
      isSendingFeedback: true
    });
    fetch(config.feedbackUrl,
          {
          method: 'POST',
          body: JSON.stringify({
                name: this.state.name,
                email: this.state.name,
                feedback: this.state.feedback
            }),
          responseType: 'json',
          headers: {
                'Content-Type': 'application/json'
          }
        })
        .then(response => {
          if(response.ok){
            return this.setState({
              isSendingFeedback: false,
              SendFeedbackSuccess: true,
            })
          }
          return this.setState({
            isSendingFeedback: false,
            SendFeedbackError: true,
          })
        })
  }

  onCancel(){
    this.setState({
      isOpen: false,
      isSendingFeedback: false,
      name: '',
      email: '',
      feedback: ''
    })
  }

  changeValue(key, event){
    this.setState({
      [key]: event.target.value
    })
  }

  onDismissError(){
    this.setState({
      isOpen: false,
      isSendingFeedback: false,
      SendFeedbackSuccess: false,
      SendFeedbackError: false,
      name: '',
      email: '',
      feedback: ''
    })
  }

  onDismissSucess(){
    this.setState({
      isOpen: false,
      isSendingFeedback: false,
      SendFeedbackSuccess: false,
      SendFeedbackError: false,
      name: '',
      email: '',
      feedback: ''
    })
  }

  renderByState(){
    if(this.state.SendFeedbackSuccess === true){
      return (
        <Notification content={{title: 'Thanks for your feedback !', detail: 'This is very much a work in progress and your feedback helps us deliver a better website'}}
                      type='success'
                      icon = {success}
                      onDismiss={this.onDismissSucess}/>)
    }

    if(this.state.SendFeedbackError === true){
      return (
        <Notification content={{title: 'We are so sorry !', detail: 'Error occured, please try later'}}
                      type='error'
                      onDismiss={this.onDismissError}/>)
    }
    return (<div className='feedback-form-inner'>
         <div className='feedback-form-header'>
             {`Have feedback on this website? We're all ears`}
             <Button className='close-btn' onClick={()=>{this.setState({isOpen: false})}} title='close feedback'><img alt='close' src={close}/></Button>
         </div>
         <div className='feedback-form-body'>
             <Input label="Name" value={this.state.name} onChange={this.changeValue.bind(this, 'name')}/>
             <Input label="Email" value={this.state.email} onChange={this.changeValue.bind(this, 'email')}/>
             <Textarea label="Feedback" value={this.state.feedback} onChange={this.changeValue.bind(this, 'feedback')} />
             <div className='feedback-form-footer'>
              <Button variant="flat" disabled={this.state.isSendingFeedback} onClick={this.onCancel}>Cancel</Button>
              <Button className='send-btn' disabled={this.state.isSendingFeedback} onClick={this.onSubmit}>{this.state.isSendingFeedback ? 'Sending...' : 'Send' }</Button>
            </div>
         </div>
     </div>)
  }


  render() {
      return (
           <div className='feedback-form'>
                <Button className='feedback-button' onClick={()=>this.setState({isOpen: true})}><img alt='feedback' src={feedback}/>Give feedback</Button>
                {this.state.isOpen && this.renderByState()}
           </div>
      );
  }
}
