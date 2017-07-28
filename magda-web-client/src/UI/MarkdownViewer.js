import React, { Component } from 'react';
import marked from 'marked';
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

function MarkdownViewer(props) {
    let markdown = {__html: marked(props.markdown)};
    return <div className='markdown' dangerouslySetInnerHTML={markdown}/>
}

MarkdownViewer.defaultProps = {markdown: ''};

export default MarkdownViewer;
