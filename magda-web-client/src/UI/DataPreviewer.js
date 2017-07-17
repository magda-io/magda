import React, { Component } from 'react';
import VegaLite from 'react-vega-lite';
import DataPreviewTable from '../UI/DataPreviewTable';


class DataPreviewer extends Component {
    props: {
      data: {
        meta: {
          field:Array<string>
        },
        data: Array<Object> | string
      },
      fileName: string
    }
    render(){
      return <div className='data-previewer'>
              <DataPreviewTable data={this.props.data} fileName= {this.props.fileName}/>
             </div>
    }
}


export default DataPreviewer;
