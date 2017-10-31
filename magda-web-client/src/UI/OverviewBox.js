import React, { Component } from 'react';
import MarkdownViewer from '../UI/MarkdownViewer';
const MAX = 600;

class OverviewBox extends Component {
    constructor(props){
        super(props);
        this.state = {
        isExpanded: false
        }
        this.toggleExpand = this.toggleExpand.bind(this);
    }

    toggleExpand(){
      this.setState({
        isExpanded: !this.state.isExpanded
      })
    }

    renderToggle(isExpanded){
      return <button onClick={this.toggleExpand} className='overview-toggle btn btn-reset'><span className='sr-only'>{isExpanded ? 'show less' : 'show more'}</span><i className={`fa fa-chevron-${isExpanded ? 'up' : 'down'}`} aria-hidden='true'></i></button>;
    }

    renderContent(_content){
      let content = _content;
      if(content.length > MAX){
          content = this.state.isExpanded ?  _content : _content.slice(0, MAX) + '...';
      }
      return <MarkdownViewer markdown={content}/>
    }
    render(){
      return <div className='white-box overview-box'>
                {this.props.content && this.renderContent(this.props.content)}
                {this.props.content && this.props.content.length > MAX && this.renderToggle(this.state.isExpanded)}
            </div>
    }
}


export default OverviewBox;
