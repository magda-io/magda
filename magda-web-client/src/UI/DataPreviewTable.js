import React, { Component } from 'react';
import ReactTable from 'react-table';
import './ReactTable.css';



class DataPreviewTable  extends Component {
    props: {
        data: {
          meta: {
            fields: Array<string>
          },
          data: Array <any>
        }
    }
    render(){
      const columns = this.props.data.meta.fields.map((item)=> ({
        Header: item, accessor: item
      }))
      return (
        <div className="clearfix">
            <div className='vis'>
              <ReactTable
                minRows={3}
                data={this.props.data.data}
                columns={columns}
              />
            </div>
        </div>
      )
    }
}


export default DataPreviewTable;
