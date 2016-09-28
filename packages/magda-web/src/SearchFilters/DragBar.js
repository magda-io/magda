import React, { Component } from 'react';
// import {event as d3Event, select as d3Select} from 'd3-selection';
// import {drag as d3Drag} from 'd3-drag';

const r = 15;
const color = '#3498db';
const colorLight = '#a0cfee';
const colorHighlight = '#8ac4ea';


class DragBar extends Component {
    constructor(props){
      super(props);
    }

    componentDidMount(){

    }

    update(nextProps){


    }

    componentWillReceiveProps(nextProps){
      this.update(nextProps);
    }


    render(){
      let wrapperStyle ={
        width: r*2 + 'px',
        height: this.props.height + 'px',
        background: '#f5f5f5'
      }

      let handleStyle ={
        height: r*2 + 'px',
        width: r*2 + 'px',
        background: color,
        borderRadius: '50%',
        textAlign: 'center'
      }

      let topHandleStyle ={
        transform: `translate(0, ${this.props.dragBarData[0]}px)`,

      }

      let bottomHandleStyle={
        transform: `translate(0, ${this.props.dragBarData[1]}px)`,
      }

      let barStyle={
        position: 'absolute',
        top: `${this.props.dragBarData[0] + r}px`,
        height: `${this.props.dragBarData[1] + 2*r}px`,
        left: 0,
        right: 0,
        background: colorLight
      }

      let iconStyle={
        color: '#fff',
        fontSize: '20px',
        lineHeight: 1.3,
      }

      return <div className='drag-bar__inner' style={wrapperStyle}>
                <div className='bar' style={barStyle}></div>
                <div className='top-handle' style={Object.assign(Object.assign({}, handleStyle), topHandleStyle)}><i className="fa fa-angle-up" style={iconStyle}></i></div>

                <div className='bottom-handle' style={Object.assign(Object.assign({}, handleStyle), bottomHandleStyle)}><i className="fa fa-angle-down" style={iconStyle}></i></div>
             </div>
    }
}

DragBar.propTypes = {};
DragBar.defaultProps = {};

export default DragBar;
