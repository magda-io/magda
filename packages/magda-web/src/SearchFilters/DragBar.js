import React, { Component } from 'react';
import debounce from 'lodash.debounce';
// import {event as d3Event, select as d3Select} from 'd3-selection';
// import {drag as d3Drag} from 'd3-drag';

const r = 15;
// const color = '#3498db';
// const colorLight = '#a0cfee';
// const colorHighlight = '#8ac4ea';


class DragBar extends Component {
    constructor(props){
      super(props);
      this.handleStart=this.handleStart.bind(this);
      this.handleDrag=this.handleDrag.bind(this);
      this.handleEnd=this.handleEnd.bind(this);
      this.handleNoop=this.handleNoop.bind(this);

    }

    componentDidMount(){
      this._wrapper = this.refs['wrapper'];
      this.debouncedUpdate = debounce(this.props.updateDragBar, 150);
    }

    update(){


    }

    componentWillReceiveProps(nextProps){
      this.update(nextProps);
    }

    handleStart(id, evt){
      this._startListener = this.handleDrag.bind(this, id);
      this._endListener = this.handleEnd.bind(this, id);

      document.addEventListener('mousemove', this._startListener);
      document.addEventListener('mouseup', this._endListener);
    }


    handleDrag(id, evt){
      this.handleNoop(evt);
      // let value = this.position(id, evt);
      // this.props.updateDragBar(id, value);
      this.debouncedUpdate(id, this.position(id, evt))
    }

    handleEnd(id, evt){
      console.log('end');
      document.removeEventListener('mousemove', this._startListener);
      document.removeEventListener('mouseup', this._endListener);
    }

    handleNoop(evt){
      evt.stopPropagation()
      evt.preventDefault()
    }

    position(id, evt){
      let dragToY = evt.clientY;
      let wrapperY = this._wrapper.getBoundingClientRect().top;
      let y = dragToY - wrapperY;
      if(id === 0){
        if(y >= 0 && y <= +this.props.dragBarData[1]){
          return y;
        } else if (y < 0) {
          return 0;
        } else{
          return +this.props.dragBarData[1];
        }
      }
      if(y >= +this.props.dragBarData[0] + 2*r && y <= this.props.height){
        return y;
      } else if (y < +this.props.dragBarData[0]) {
        return +this.props.dragBarData[0] + 2*r;
      } else{
        return this.props.height;
      }
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


      return <div className='drag-bar__inner' style={wrapperStyle} ref='wrapper'>
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
