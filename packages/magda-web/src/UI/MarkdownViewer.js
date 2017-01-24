import React, { Component } from 'react';
import marked from 'marked';
import {config} from '../config';
import './MarkdownViewer.css';

const LIST = ['blockquote',
       'br',
       'code',
       'codespan',
       'del',
       'em',
       'heading',
       'hr',
       'html',
       'image',
       'link',
       'list',
       'listitem',
       'paragraph',
       'strong',
       'table',
       'tablecell',
       'tablerow'];

let renderer = new marked.Renderer();
LIST.forEach(l=>{
 renderer[l] = function (text) {
   return text;
 };
});

class MarkdownViewer extends Component {
    render(){
      if(this.props.stripped === true){
        let text = marked(this.props.markdown, { renderer: renderer });

        let length = config.descriptionLength;
        let array = text.split(" ");
        let string = array.slice(0, length).join(" ");
        if(array.length > length){
           string += "...";
        }
        return <div className='markdown__stripped markdown__wrap'>{string}</div>
      } else{
        let markdown = {__html: marked(this.props.markdown)};
        return <div className='markdown' dangerouslySetInnerHTML={markdown}/>
      }
    }
}

MarkdownViewer.propTypes = {markdown: React.PropTypes.string};
MarkdownViewer.defaultProps = {markdown: ''};

export default MarkdownViewer;
