import React, { Component } from 'react';
import VegaLite from 'react-vega-lite';
import DataPreviewTable from '../UI/DataPreviewTable';
import DataPreviewPdf from '../UI/DataPreviewPdf';
import DataPreviewTextBox from '../UI/DataPreviewTextBox';
import type {PreviewData} from '../helpers/previewData';


class DataPreviewer extends Component {
    props: {
      data: PreviewData,
      fileName: string
    }

    render(){
      const url = this.props.url;
      return <div className='data-previewer'>
              <h3 className='section-heading'><a href={url} target='_blank'>{url && url.substring(url.lastIndexOf('/')+1)}</a></h3>
              {this.props.data.meta.type === 'tabular' && <DataPreviewTable data={this.props.data}/>}
              {this.props.data.meta.type === 'pdf' && <DataPreviewPdf data={this.props.data}/>}
              {this.props.data.meta.type === 'txt' && <DataPreviewTextBox data ={this.props.data}/>}
              {this.props.data.meta.type === 'html' && <iframe width="100%" height="600px" src={this.props.data.data}></iframe>}
             </div>
    }
}


export default DataPreviewer;
