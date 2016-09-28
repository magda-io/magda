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
      this.dragStart = this.dragStart.bind(this);
      this.drag = this.drag.bind(this);
      this.dragEnd = this.drag.bind(this);
    }

    componentDidMount(){

    }

    update(nextProps){


    }

    componentWillReceiveProps(nextProps){
      this.update(nextProps);
    }

    dragStart(evt){
      console.log(evt);

    }

    drag(evt){
      console.log(evt);

    }

    dragEnd(evt){
      console.log(evt);

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
        height: `${this.props.dragBarData[1] + 2*r}px`
      }


      return <div className='drag-bar__inner' style={wrapperStyle}>
                <div className='bar' style={barStyle}></div>
                <div className='top-handle handle'
                      draggable="true"
                      onDragStart={this.dragStart}
                      onDrag={this.drag}
                      onDragEnd={this.dragEnd}
                      style={topHandleStyle}>
                    <i className="fa fa-angle-up"></i>
                </div>

                <div className='bottom-handle handle'
                      draggable="true"
                      onDragStart={this.dragStart}
                      onDrag={this.drag}
                      onDragEnd={this.dragEnd}
                      style={bottomHandleStyle}>
                    <i className="fa fa-angle-down"></i>
              </div>
             </div>
    }
}

DragBar.propTypes = {};
DragBar.defaultProps = {};

export default DragBar;
