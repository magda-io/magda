import React, { Component } from 'react';
import {event as d3Event, select as d3Select} from 'd3-selection';
import {drag as d3Drag} from 'd3-drag';

const r = 15;
let positions =[
  {id: 0, y: r},
  {id: 1, y: 100}
];

class DragBar extends Component {
    constructor(props){
      super(props);
    }

    componentDidMount(){
      let that = this;
      // create the circles
      this._circles = d3Select(this._g).selectAll('circle')
      .data(positions).enter().append('circle')
      .attr('cx', r)
      .attr('r', r)
      .style('fill','#3498db')
      .attr('cy', d=>d.y);

      let dragInteraction = d3Drag().on('start', start).on('drag', drag).on('end', end);
      this._circles.call(dragInteraction);

      function start(d){
        d3Select(this).style('fill', 'red');
      }

      function drag(d){
        console.log(d3Event.y);
        let target = d3Select(this);
        if(d3Event.y> 0 && d3Event.y < that.props.height){
          positions[d.id].y = d3Event.y;
          that.update();
        }
        target.style('fill', 'red');
      }

      function end(d){
        d3Select(this).style('fill', '#3498db');
      }

    }

    update(){
      this._circles.data(positions).attr('cy', d=> d.y)
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
