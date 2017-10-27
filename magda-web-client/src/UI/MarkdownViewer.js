import React from 'react';
import MarkdownIt from 'markdown-it';
import './MarkdownViewer.css';
import defined from '../helpers/defined';
var DOMPurify = require('dompurify/dist/purify');

class MarkdownViewer extends React.Component  {
  constructor(props) {
   super(props);
   this.state = {isCollapsed: true};
 }

 componentDidMount(){
   this.notifyParentOfContentLength();
 }

 componentWillReceiveProps(nextProps){
   if(nextProps.markdown !== this.props.markdown){
     this.notifyParentOfContentLength();
   }
 }

 notifyParentOfContentLength(){
   const numberOfChildrenFromMarkdownAsHtml = this.markdown.children.length;
   if (this.props.updateContentLength){
     this.props.updateContentLength(numberOfChildrenFromMarkdownAsHtml);
   }
 }

 render(){
   let markdown = {__html: markdownToHtml(this.props.markdown)};
   return(
      <div className='markdown' dangerouslySetInnerHTML={markdown} ref={markdown => this.markdown = markdown}></div>
   )
 }
}

MarkdownViewer.defaultProps = {markdown: ''};

export default MarkdownViewer;

const md = new MarkdownIt({
    html: true,
    linkify: true
});

const htmlRegex = /^\s*<[^>]+>/;


function markdownToHtml(markdownString, allowUnsafeHtml, options) {
    if (!defined(markdownString) || markdownString.length === 0) {
        return markdownString;
    }
    // If the text looks like html, don't try to interpret it as Markdown because
    // we'll probably break it in the process.
    var unsafeHtml;
    if (htmlRegex.test(markdownString)) {
        unsafeHtml = markdownString;
    } else {
        // Note this would wrap non-standard tags such as <collapsible>hi</collapsible> in a <p></p>, which is bad.
        unsafeHtml = md.render(markdownString);
    }
    if (allowUnsafeHtml) {
        return unsafeHtml;
    } else {
        return DOMPurify.sanitize(unsafeHtml, options);
    }
}
