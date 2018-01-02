import React from 'react';
import ReactTable from 'react-table';
import './ReactTable.css';

function DataPreviewTable(
  props: {
      data: {
        meta: {
          fields: Array<string>
        },
        data: Array <any>
      }
  },
) {
  const columns = props.data.meta.fields.map((item)=> ({
    Header: item, accessor: item
  }))
  return (
    <div className="clearfix">
        <div className='vis'>
          <ReactTable
            minRows={3}
            data={props.data.data}
            columns={columns}
          />
        </div>
    </div>
  );
}


export default DataPreviewTable;
