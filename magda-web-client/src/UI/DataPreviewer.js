import React, { Component } from 'react';
import VegaLite from 'react-vega-lite';
import DataPreviewTable from '../UI/DataPreviewTable';
import DataPreviewPdf from '../UI/DataPreviewPdf';
import type {PreviewData} from '../helpers/previewData';


class DataPreviewer extends Component {
    props: {
      data: PreviewData,
      fileName: string
    }
    render(){
      debugger
      return <div className='data-previewer'>
              {this.props.data.meta.type === 'tabular' && <DataPreviewTable data={this.props.data} fileName= {this.props.fileName}/>}
              {this.props.data.meta.type === 'pdf' && <DataPreviewPdf data={this.props.data} fileName= {this.props.fileName}/>}
             </div>
    }
}


export default DataPreviewer;
