import React, { Component } from 'react';
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

  toggle(){
    this.setState({
      isOpen: !this.state.isOpen
    })
  }

  render(){
    console.log(this.props);
    return (
      <div className={`dropdown ${this.state.isOpen ? 'is-open': ''}`}>
        <button className='btn-dropdown btn' onClick={this.toggle}>{this.props.activeOption}<i className='fa fa-caret-down' aria-hidden='true'></i></button>
        <ul className='list-unstyled dropdown-options'>
          {this.props.options.map(o=>
          <li key={o}><button className='btn btn-dropdown--option'  onClick={this.select.bind(this, o)}>{o}</button></li>)}
        </ul>

      </div>
      );
  }
}

DropDown.propTypes = {options: React.PropTypes.array,
                      activeOption: React.PropTypes.string,
                      select: React.PropTypes.func};
DropDown.defaultProps = {activeOption: {}};

export default DropDown;
