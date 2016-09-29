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
      this.handleStart=this.handleStart.bind(this);
      this.handleDrag=this.handleDrag.bind(this);
      this.handleEnd=this.handleEnd.bind(this);
      this.handleNoop=this.handleNoop.bind(this);
    }

    componentDidMount(){

    }

    update(nextProps){


    }

    componentWillReceiveProps(nextProps){
      this.update(nextProps);
    }

    handleStart(id){
      document.addEventListener('mousemove', this.handleDrag.bind(this, id));
      document.addEventListener('mouseup', this.handleEnd.bind(this, id));
      console.log('start');
    }


    handleDrag(id, evt){
      this.handleNoop(evt);
      console.log(id);
      console.log('dragging');
    }

    handleEnd(id, evt){
      console.log('end');
      console.log(id);
      document.removeEventListener('mousemove', this.handleDrag.bind(this, id));
      document.removeEventListener('mouseup', this.handleEnd.bind(this, id));
    }

    handleNoop(evt){
      evt.stopPropagation()
      evt.preventDefault()
    }


    render(){
      let wrapperStyle ={
        height: this.props.height + 'px'
      }

      let topHandleStyle ={
        transform: `translate(0, ${this.props.dragBarData[0]}px)`,
      }

      let bottomHandleStyle={
        transform: `translate(0, ${this.props.dragBarData[1]}px)`,
      }

      let barStyle={
        top: `${this.props.dragBarData[0] + r}px`,
        height: `${this.props.dragBarData[1] - this.props.dragBarData[0] + 2*r}px`
      }


      return <div className='drag-bar__inner' style={wrapperStyle}>
                <div className='bar' style={barStyle}></div>
                <div className='top-handle handle'
                      onMouseDown={this.handleStart.bind(this, 0)}
                      style={topHandleStyle}>
                    <i className="fa fa-angle-up"></i>
                </div>

                <div className='bottom-handle handle'
                      onMouseDown={this.handleStart.bind(this, 1)}
                      style={bottomHandleStyle}>
                    <i className="fa fa-angle-down"></i>
              </div>
             </div>
    }
}

DragBar.propTypes = {};
DragBar.defaultProps = {};

export default DragBar;
