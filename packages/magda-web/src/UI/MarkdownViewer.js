import React, { Component } from 'react';
import marked from 'marked';

import './MarkdownViewer.css';
class MarkdownViewer extends Component {
    render(){
      let markdown = {__html: marked(this.props.markdown)};
      return <div className='markdown' dangerouslySetInnerHTML={markdown}/>
    }
}

MarkdownViewer.propTypes = {markdown: React.PropTypes.string};
MarkdownViewer.defaultProps = {markdown: ''};

export default MarkdownViewer;
