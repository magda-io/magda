import React, { Component } from 'react';
import VegaLite from 'react-vega-lite';
import DataPreviewTable from '../UI/DataPreviewTable';
import type {PreviewData} from '../helpers/previewData';


class DataPreviewer extends Component {
    props: {
      data: PreviewData,
      fileName: string
    }
    render(){
      return <div className='data-previewer'>
              {this.props.data.meta.type === 'tabular' && <DataPreviewTable data={this.props.data} fileName= {this.props.fileName}/>}
             </div>
    }
}


export default DataPreviewer;
