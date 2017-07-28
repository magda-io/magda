import React, { Component } from 'react';
import VegaLite from 'react-vega-lite';
import DataPreviewTable from '../UI/DataPreviewTable';
import DataPreviewPdf from '../UI/DataPreviewPdf';
import DataPreviewTextBox from '../UI/DataPreviewTextBox';
import DataPreviewGoogleViewer from '../UI/DataPreviewGoogleViewer';
import DataPreviewJson from '../UI/DataPreviewJson';
import type {PreviewData} from '../helpers/previewData';
import News from './News';


function DataPreviewer(
  props: {
    data: PreviewData,
    fileName: string
  },
) {
  const url = props.url;
  return (
    <div className='data-previewer'>
            <h3 className='section-heading'><a href={url} target='_blank'>{url && url.substring(url.lastIndexOf('/')+1)}</a></h3>
            {props.data.meta.type === 'geo' && <iframe name='FRAME1' src={props.data.data} width='100%' height='600px' scrolling='auto' frameBorder='0'/>}
            {props.data.meta.type === 'tabular' && <DataPreviewTable data={props.data}/>}
            {props.data.meta.type === 'json' && <DataPreviewJson data={props.data}/>}
            {props.data.meta.type === 'pdf' && <DataPreviewPdf data={props.data}/>}
            {props.data.meta.type === 'txt' && <DataPreviewTextBox data ={props.data}/>}
            {props.data.meta.type === 'html' && <iframe width="100%" height="600px" src={props.data.data}></iframe>}
            {props.data.meta.type === 'rss' && <News newsItems={props.data.data}/>}
            {props.data.meta.type === 'googleViewable' && <DataPreviewGoogleViewer data={props.data}/>}
           </div>
  );
}


export default DataPreviewer;
