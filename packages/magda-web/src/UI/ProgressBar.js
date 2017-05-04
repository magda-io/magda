import React, { Component } from 'react';
import './ProgressBar.css';
class ProgressBar extends Component {
    render(){
      let style = {
        width: '100%',
        height: '100%'
      }
      return <div className='progress-bar'>
                <div className='progress' style={style}>
                </div>
             </div>
    }
}


export default ProgressBar;
