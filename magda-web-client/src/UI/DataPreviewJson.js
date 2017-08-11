import React, { Component } from 'react';
import LazyComponent from '../Components/LazyComponent';

class DataPreviewJson extends Component {
    getComponent(){
      return import('react-json-tree').then(module => module.default)
    }

    render(){
      return <div className='data-preview-json'>
               <LazyComponent data={this.props.data} getComponent={this.getComponent}/>
             </div>
    }
}


export default DataPreviewJson;
