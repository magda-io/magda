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
        let markdown = {__html: marked(this.props.markdown)};
        return <div className='markdown' dangerouslySetInnerHTML={markdown}/>
    }
}

MarkdownViewer.defaultProps = {markdown: ''};

export default MarkdownViewer;
