import React, { Component } from 'react';
import debounce from 'lodash.debounce';
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
      let g = this.refs['g'];
      let data = this.props.dragBarData;
      let debouncedUpdate = debounce(this.props.updateDragBar, 150);
      this._circles = d3Select(g).selectAll('circle')
        .data(data).enter().append('circle')
        .attr('cx', r)
        .attr('cy', d=>d)
        .attr('r', r)
        .style('fill',color);
      
      this._bar = d3Select(g).append('rect')
      .attr('width', r*2)
      .attr('height', Math.abs(this.props.dragBarData[0] - this.props.dragBarData[1]))
      .attr('x', 0)
      .attr('y', this.props.dragBarData[0] - this.props.dragBarData[1] < 0 ? this.props.dragBarData[0] : this.props.dragBarData[1])
      .style('fill', colorLight);

      let dragInteraction = d3Drag().on('start', start).on('drag', drag).on('end', end);
      this._circles.call(dragInteraction);

      function start(d){
        d3Select(this).style('fill', colorHighlight);
      }
      
      function drag(d, i){
        let y = null;
        let data = that.props.dragBarData;

        console.log('dragging');

        if(i === 0){
          if (d3Event.y >=r && d3Event.y <= data[1]){
            y = d3Event.y;
          } else if(d3Event.y > data[1]){
            y = data[1];
          } else{
            y = r;
          }
        } else{
          if (d3Event.y >=data[0] && d3Event.y <= that.props.height - r){
            y = d3Event.y;
          } else if(d3Event.y < data[0]){
            y = data[0];
          } else {
            y = that.props.height - r;
          }
        }

        data[i] = y;
        that.update(data);
        debouncedUpdate(i, y);
      }
      
      function end(d){
        d3Select(this).style('fill', color);
      }
    }

    update(data){
      this._circles.data(data).attr('cy', d=> d);
      this._bar.attr('height', Math.abs(data[0] - data[1]))
               .attr('y', data[0] - data[1] < 0 ? data[0] : data[1]);
    }

    componentWillReceiveProps(nextProps){
      if(nextProps.dragBarData[0] !== this.props.dragBarData[0] ||
         nextProps.dragBarData[1] !== this.props.dragBarData[1] ){
        this.update(nextProps.dragBarData);
      }
    }

    render(){
      return <svg className='drag-bar__inner' width={r*2} height={this.props.height}>
                <g ref='g'/>
             </svg>
    }
}

DragBar.propTypes = {};
DragBar.defaultProps = {};

export default DragBar;
