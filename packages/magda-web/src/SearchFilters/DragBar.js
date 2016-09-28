import React, { Component } from 'react';
import {event as d3Event, select as d3Select} from 'd3-selection';
import {drag as d3Drag} from 'd3-drag';

const r = 15;
const color = '#3498db';
const colorLight = '#a0cfee';
const colorHighlight = '#8ac4ea';


class DragBar extends Component {
    constructor(props){
      super(props);
    }

    componentDidMount(){
      let that = this;

      this._bar = d3Select(this._g).append('rect')
      .attr('width', r*2)
      .attr('height', Math.abs(this.props.dragBarData[0].y - this.props.dragBarData[1].y))
      .attr('x', 0)
      .attr('y', this.props.dragBarData[0].y - this.props.dragBarData[1].y < 0 ? this.props.dragBarData[0].y : this.props.dragBarData[1].y)
      .style('fill', color);

      // create the circles
      this._circles = d3Select(this._g).selectAll('circle')
      .data(this.props.dragBarData).enter().append('circle')
      .attr('cx', r)
      .attr('r', r)
      .style('fill',colorLight)
      .attr('cy', d=>d.y);

      // let dragInteraction = d3Drag().on('start', start).on('drag', drag).on('end', end);
      // this._circles.call(dragInteraction);
      //
      // function start(d){
      //   d3Select(this).style('fill', colorHighlight);
      // }
      //
      // function drag(d){
      //   let target = d3Select(this);
      //   debugger
      //   if(d.id === 0){
      //     // top slider, need to > 0, < second slider
      //     if(d3Event.y > 0 && d3Event.y < that.props.dragBarData[1].y){
      //       console.log('dragging');
      //       that.props.updateDragBar(d.id, d3Event.y);
      //     }
      //   } else {
      //     // bottom slider
      //     if(d3Event.y < that.props.height - r && d3Event.y > that.props.dragBarData[0].y){
      //       that.props.updateDragBar(d.id, d3Event.y);
      //     }
      //   }
      //   target.style('fill', colorHighlight);
      // }
      //
      // function end(d){
      //   d3Select(this).style('fill', colorLight);
      // }
    }

    update(nextProps){
      this._circles.data(nextProps.dragBarData).attr('cy', d=> d.y);
      this._bar.attr('height', Math.abs(nextProps.dragBarData[0].y - nextProps.dragBarData[1].y))
               .attr('y', nextProps.dragBarData[0].y - nextProps.dragBarData[1].y < 0 ? nextProps.dragBarData[0].y : nextProps.dragBarData[1].y);

    }

    componentWillReceiveProps(nextProps){
      this.update(nextProps);
    }


    render(){
      return <svg className='drag-bar__inner' width={r*2} height={this.props.height}>
                <g ref={g=>{this._g = g}}/>
             </svg>
    }
}

DragBar.propTypes = {};
DragBar.defaultProps = {};

export default DragBar;
