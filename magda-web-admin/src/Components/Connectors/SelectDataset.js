//@flow
import React from 'react';
import {config} from '../../config.js';
import ReactDocumentTitle from 'react-document-title';
import { Link } from "react-router";


export default class SelectDataset extends React.Component {
  constructor(props) {
    super(props);
    this.state ={
      testDatasetId: 'a0f2aa22-512d-4c08-9b7d-bb8a51163f4c',
      testDatasetUrl: '',
      testDatasetSearchText: ''
    }
    this.onChange = this.onChange.bind(this);
  }

  onChange(key, event){
    this.setState({
      [key]: event.target.value
    })
  }


  render() {
    return (
      <ReactDocumentTitle title={'select dataset' + config.appName}>
        <div className='container'>
          <div className='col-sm-8'>
            <h3>Select a {this.props.params.connectorId} dataset to use to test the connecor:</h3>
            <div>Dataset ID <input type="text" className="form-control" onChange={this.onChange.bind(this,'testDatasetId')} value={this.state.testDatasetId}/></div>
            <div>Dataset URL <input type="text" className="form-control" onChange={this.onChange.bind(this, 'testDatasetUrl')} value={this.state.testDatasetUrl}/></div>
            <div>Search by title <input type="text" className="form-control" onChange={this.onChange.bind(this, 'testDatasetSearchText')} value={this.state.testDatasetSearchText}/></div>
            <Link className='btn btn-primary' disabled={!this.state.testDatasetId} to={`connectors/${this.props.params.connectorId}/${this.state.testDatasetId}`}>Go</Link>
          </div>
        </div>
      </ReactDocumentTitle>
    );
  }
}
