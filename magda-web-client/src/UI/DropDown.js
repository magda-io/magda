import React, { Component } from 'react';
import Dropdown from 'muicss/lib/react/dropdown';
import './DropDown.css';

class DropDown extends Component {
  constructor(props){
    super(props);
    this.select = this.select.bind(this);
    this.toggle = this.toggle.bind(this);
    this.state = {
      isOpen: false
    };
  }

  select(option){
      this.props.select(option);
      this.setState({
        isOpen: false
      })
  }

  toggle(ev){
    ev.preventDefault();
    this.setState({
      isOpen: !this.state.isOpen
    })
  }

  render(){
    return (
      <Dropdown label={this.props.activeOption} >
        <ul className='list-unstyled dropdown__options'>
          {this.props.options.map(o=>
          <li key={o.id}><button className='btn dropdown__option-btn'  onClick={this.select.bind(this, o)}>{o.value}</button></li>)}
        </ul>
      </Dropdown>
      );
  }
}

DropDown.defaultProps = {activeOption: {}};

export default DropDown;
