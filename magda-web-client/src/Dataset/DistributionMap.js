// @flow
import React, { Component } from 'react';
import { connect } from 'react-redux';
import generatePreviewData from '../helpers/generatePreviewData';
import fetch from 'isomorphic-fetch';
import type { DatasetDistribution } from '../types';
import * as xml2js from 'xml2js';

class DistributionMap extends Component {
  props: {
    distribution: DatasetDistribution
  }
  state: {
    mapData: ?string
  }

  constructor(props: props){
    super(props)
    this.state={
      mapData : null
    }
  }
  componentWillMount(){
    if(this.props.distribution.id){
      // preload the data to figure out how to display
      // generate url config
      fetch(this.props.distribution.downloadURL).then(response=> response.text()).then((text: string)=>{
        let json: Object;
        xml2js.parseString(text, {
            xmlns: true,
            tagNameProcessors: [ xml2js.processors.stripPrefix ],
            async: false,
            explicitRoot: false
        }, function(err, result) {
            json = result;
        });
        this.setState({
          mapData: generatePreviewData(this.props.distribution.downloadURL, json)
        })
      })

    }
  }

  render(){
    return <div className='dataset-details container' >
            {this.state.mapData && <iframe name='FRAME1' src={`https://nationalmap.gov.au/#clean&hideExplorerPanel=1&start=${this.state.mapData}`} width='100%' height='600px' scrolling='auto' frameBorder='0'/>}
          </div>
  }
}

function mapStateToProps(state: Object, ownProps: Object) {
  const distribution: DatasetDistribution=state.record.distribution;
  return {
    distribution
  };
}

export default connect(mapStateToProps)(DistributionMap);
