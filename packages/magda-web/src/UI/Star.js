import React, { Component } from 'react';
import './Star.css';
class Star extends Component {
    constructor(props){
      super(props);
      this.onClick = this.onClick.bind(this);
      this.state = {
        isActive: false
      };
    }

    onClick(){
      this.setState({
        isActive: !this.state.isActive
      })
    }

    render(){
      return <button onClick={this.onClick} className={`btn star-btn ${this.state.isActive ? 'is-active' : ''}`}><i className="fa fa-star" aria-hidden="true"/></button>
    }
}
export default Star;
