import React, { Component } from 'react';
import './ProgressBar.css';
class ProgressBar extends Component {
    render(){
      let style = {
        width: this.props.progress*100 + '%',
        height: '100%'
      }
      return <div className='progress-bar'>
                <div className='progress' style ={style}>
                </div>
             </div>
    }
}

ProgressBar.propTypes = {progess: React.PropTypes.number};
ProgressBar.defaultProps = { progess: 0};

export default ProgressBar;
