import React, { Component } from 'react';
import debounce from 'lodash.debounce';
import {event as d3Event, select as d3Select} from 'd3-selection';
import {drag as d3Drag} from 'd3-drag';

const r = 15;
const color = '#3498db';
const colorLight = '#a0cfee';
const colorHighlight = '#8ac4ea';

/**
* Drag bar component, provides a dragging interface for user to select a date range
*/
class DragBar extends Component {
    componentDidMount(){
      let that = this;
      // create a 'g' tag inside the svg to contain all our svg components
      let g = this.refs['g'];
      let data = this.props.dragBarData;
      let debouncedUpdate = debounce(this.props.updateDragBar, 150);

      // create a bar to indicate range
      this._bar = d3Select(g).append('rect')
      .attr('width', r*2)
      .attr('height', Math.abs(this.props.dragBarData[0] - this.props.dragBarData[1]))
      .attr('x', 0)
      .attr('y', this.props.dragBarData[0] - this.props.dragBarData[1] < 0 ? this.props.dragBarData[0] : this.props.dragBarData[1])
      .style('fill', colorLight);

      // create two handles to listen to drag events
      this._handles = d3Select(g).selectAll('rect.handle')
        .data(data).enter().append('rect')
        .attr('class', 'handle')
        .attr('x', 0)
        .attr('y', d=>d)
        .attr('width', r*2)
        .attr('height', r*2)
        .style('fill',color);

      let dragInteraction = d3Drag().on('start', start).on('drag', drag).on('end', end);
      this._handles.call(dragInteraction);

      function start(d){
        // highlight on drag starts
        d3Select(this).style('fill', colorHighlight);
      }

      function drag(d, i){
        let y = null;
        let data = that.props.dragBarData;
        if(i === 0){
          if (d3Event.y >=0 && d3Event.y <= data[1]){
            y = d3Event.y;
          } else if(d3Event.y > data[1]){
            y = data[1];
          } else{
            y = r;
          }
        } else{
          if (d3Event.y >=data[0] && d3Event.y <= that.props.height - 2*r){
            y = d3Event.y;
          } else if(d3Event.y < data[0]){
            y = data[0];
          } else {
            y = that.props.height - 2*r;
          }
        }

        data[i] = y;
        // update UI first to give user the illusion that it's REALLY responsive
        that.updateUI(data);
        // then debounce update url
        debouncedUpdate(i, y);
      }

      function end(d){
        d3Select(this).style('fill', color);
      }
    }

    updateUI(data){
      // update handle position
      this._handles.data(data).attr('y', d=> d);
      // update bar position
      this._bar.attr('height', Math.abs(data[0] - data[1]))
               .attr('y', data[0] - data[1] < 0 ? data[0] : data[1]);
    }

    componentWillReceiveProps(nextProps){
      if(nextProps.dragBarData[0] !== this.props.dragBarData[0] ||
         nextProps.dragBarData[1] !== this.props.dragBarData[1] ){
        this.updateUI(nextProps.dragBarData);
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
