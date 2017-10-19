import React, { Component } from 'react';
import MarkdownIt from 'markdown-it';
import './MarkdownViewer.css';


class MarkdownViewer extends React.Component  {
  constructor(props) {
   super(props);
   this.state = {isCollapsed: true};
 }

 componentDidMount(){
   const numberOfChildrenFromMarkdownAsHtml = this.markdown.children.length;
   {this.props.updateContentLength && this.props.updateContentLength(numberOfChildrenFromMarkdownAsHtml);}
 }

 render(){
   const md = new MarkdownIt();
   const htmlcontent = md.render(this.props.markdown);
   let markdown = {__html: htmlcontent};
   return(
      <div className='markdown' dangerouslySetInnerHTML={markdown} ref={markdown => this.markdown = markdown}/>
   )
 }
}

MarkdownViewer.defaultProps = {markdown: ''};

export default MarkdownViewer;
