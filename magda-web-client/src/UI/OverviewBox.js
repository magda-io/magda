import React, { Component } from 'react';
import MarkdownViewer from '../UI/MarkdownViewer';
import './OverviewBox.css';
const MAX = 600;


class OverviewBox extends Component {
    constructor(props){
        super(props);
        this.state = {
        isExpanded: false,
        showToggle: false
        }
        this.toggleExpand = this.toggleExpand.bind(this);
        this.updateContentLength = this.updateContentLength.bind(this);
    }

    toggleExpand(){
      this.setState({
        isExpanded: !this.state.isExpanded
      })
    }

    updateContentLength(length){
      if(length > 2){
        this.setState({
          showToggle: true
        })
      }
    }

    renderToggle(isExpanded){
      return <button onClick={this.toggleExpand} className='overview-toggle btn btn-reset'><span className='sr-only'>{isExpanded ? 'show less' : 'show more'}</span><i className={`fa fa-chevron-${isExpanded ? 'up' : 'down'}`} aria-hidden='true'></i></button>;
    }

    renderContent(content){
      return <MarkdownViewer markdown={content} updateContentLength={this.updateContentLength}/>
    }

    render(){
      return <div className='white-box overview-box'>
                {this.props.content && this.renderContent(this.props.content)}
                {this.props.content && this.props.content.length > MAX && this.renderToggle(this.state.isExpanded)}
            </div>
    }
}


export default OverviewBox;
