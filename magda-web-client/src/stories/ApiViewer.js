import React, { Component } from 'react';
import ReactTable from 'react-table';
class ApiViewer extends React.Component {
    constructor(props){
      super(props);
      this.state = {data: null, hitCount: 0}
    }
    componentWillMount(){
      fetch(this.props.url)
      .then((response)=>{
        if(response.status === 200){
          return response.json()
        }
        return false;
      })
      .then(json=>{
        this.setState({
          data: json.options,
          hitCount: json.hitCount
        })
      })
    }

    render(){
      const columns = [{
        Header: 'Name',
        accessor: 'value',
      },
      {
        Header: 'hitCount',
        accessor: 'hitCount'
      },
    ]
      return <div>
        {(this.state.data && this.state.data.length > 0) && <ReactTable
            filterable
            data={this.state.data}
            columns = {columns}
            defaultPageSize ={this.state.hitCount}
            defaultSorted={[
              {
                id: "hitCount",
                desc: true
              }
            ]}
            className="-striped -highlight"
          />}
      </div>
    }
}


export default ApiViewer;
