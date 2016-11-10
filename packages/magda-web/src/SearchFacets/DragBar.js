import React, { Component } from 'react';
import debounce from 'lodash.debounce';
import {event as d3Event, select as d3Select} from 'd3-selection';
import {drag as d3Drag} from 'd3-drag';

const r = 15;
const color = '#3498db';

const iconPath = [
  {id: 'arrow0',
   path: 'M30.054 23.768l-2.964 2.946q-0.339 0.339-0.804 0.339t-0.804-0.339l-9.482-9.482-9.482 9.482q-0.339 0.339-0.804 0.339t-0.804-0.339l-2.964-2.946q-0.339-0.339-0.339-0.813t0.339-0.813l13.25-13.232q0.339-0.339 0.804-0.339t0.804 0.339l13.25 13.232q0.339 0.339 0.339 0.813t-0.339 0.813z'},
  {id: 'arrow1',
   path: 'M30.054 14.429l-13.25 13.232q-0.339 0.339-0.804 0.339t-0.804-0.339l-13.25-13.232q-0.339-0.339-0.339-0.813t0.339-0.813l2.964-2.946q0.339-0.339 0.804-0.339t0.804 0.339l9.482 9.482 9.482-9.482q0.339-0.339 0.804-0.339t0.804 0.339l2.964 2.946q0.339 0.339 0.339 0.813t-0.339 0.813z'}
]

/**
* Drag bar component, provides a dragging interface for user to select a date range
*/
class DragBar extends Component {
    componentDidMount(){
      let that = this;
      // create a 'g' tag inside the svg to contain all our svg components
      let g = this.refs['g'];
      let data = this.props.dragBarData;
      let debouncedUpdate = debounce(this.props.onDrag, 150);

      // use svg fill to add icon
      // this saves us having to manage and animate for svg elements
      // we shouldn't directly use icon as handle because they are not as easy to grab as rects
      let defs = d3Select(g).append('defs');
      defs.selectAll('pattern')
          .data(iconPath)
          .enter()
          .append('pattern')
          .attr('id', d=>d.id)
          .attr('width', 1)
          .attr('height', 1)
          .append('path')
          .attr('transform', (d, i)=>`translate(8,${i*10})scale(0.5)`)
          .attr('d', d=> d.path)
          .attr('fill', '#fff');

      // create a bar to indicate range
      this._bar = d3Select(g).append('rect')
      .attr('width', r*2)
      .attr('height', Math.abs(this.props.dragBarData[1] - this.props.dragBarData[0]) + 2*r)
      .attr('x', 0)
      .attr('y', this.props.dragBarData[0])
      .style('fill', color);

      // create two handles to listen to drag events
      // TO DO: use fill:url(#arrow) to add icon

      this._handles = d3Select(g).selectAll('rect.handle')
        .data(data).enter().append('rect')
        .attr('class', 'handle')
        .attr('x', 0)
        .attr('y', d=>d)
        .attr('width', r*2)
        .attr('height', r*2)
        .style('fill',(d, i)=>`url(#arrow${i})`);

      let dragInteraction = d3Drag().on('start', start).on('drag', drag).on('end', end);
      this._handles.call(dragInteraction);

      function start(d){

      }

      function drag(d, i){
        let y = null;
        let data = that.props.dragBarData;
        if(i === 0){
          if (d3Event.y >=0 && d3Event.y< data[1]){
            y = d3Event.y;
          } else if(d3Event.y >= data[1]){
            y = data[1] - 1;
          } else {
            y = 0;
          }
        } else{
          if (d3Event.y >data[0] && d3Event.y <= that.props.height - 2*r){
            y = d3Event.y;
          } else if(d3Event.y <= data[0]){
            y = data[0] -1;
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
      }
    }

    updateUI(data){
      // update handle position
      this._handles.data(data).attr('y', d=> d);
      // update bar position
      this._bar.attr('height', data[1] - data[0] + 2*r)
               .attr('y', data[0]);
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
