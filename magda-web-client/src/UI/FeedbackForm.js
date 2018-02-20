import React from 'react';
import Input from 'muicss/lib/react/input';
import './FeedbackForm.css';
import Button from 'muicss/lib/react/button';
import feedback from "../assets/feedback.svg";
import close from "../assets/close.svg";

export default class FeedbackForm extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isOpen: false,
      name: '',
      email: '',
      feedback: ''
    };
    this.onCancel = this.onCancel.bind(this);
    this.changeValue = this.changeValue.bind(this);
    this.onSubmit = this.onSubmit.bind(this);
  }

  onSubmit(){
    debugger
  }

  onCancel(){
    this.setState({
      isOpen: false,
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


  render() {
    const preamble = "Have feedback on this website? We're all ears";

      return (
           <div className='feedback-form'>
                <Button className='feedback-button' onClick={()=>this.setState({isOpen: true})}><img src={feedback}/>Give feedback</Button>
              {this.state.isOpen && (<div className='feedback-form-inner'>
                   <div className='feedback-form-header'>
                       {preamble}
                       <Button className='close-btn' onClick={()=>{this.setState({isOpen: false})}} title='close feedback'><img src={close}/></Button>
                   </div>
                   <form>
                       <Input label="Name" value={this.state.name} onChange={this.changeValue.bind(this, 'name')}/>
                       <Input label="Email" value={this.state.email} onChange={this.changeValue.bind(this, 'email')}/>
                       <Input label="Feedback" value={this.state.feedback} onChange={this.changeValue.bind(this, 'feedback')} />
                       <div className='feedback-form-footer'>
                        <Button className='send-btn' onSubmit={this.onSubmit}>Send</Button>
                        <Button variant="flat" onClick={this.onCancel}>Cancel</Button>
                      </div>
                   </form>
               </div>)}
           </div>
      );
  }
}
