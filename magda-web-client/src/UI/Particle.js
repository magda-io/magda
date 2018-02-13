import React, { Component } from 'react';
import './Particle.css';

class Particles extends Component {
    constructor(props) {
      super(props);
      this.state = {x:  Math.random(), y: Math.random(), intervalId : null};
    }


    render(){
      debugger
      const style = {
        background:'#F55860',
        filter: 'blur(3px)',
        width: '30px',
        height: '30px',
        borderRadius: '30px',
        transform: `translate(${this.state.x * window.innerWidth}px, ${this.state.y * this.props.height}px)`,
        transition: 'all 0.2s'
      }
      return <div className='particle' style={style}>
             </div>
    }
}



export default Particles;
