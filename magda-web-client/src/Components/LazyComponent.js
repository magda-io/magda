import React, { Component } from 'react';

class LazyComponent extends Component {
  constructor(props) {
    super(props);
    this.state = {
      component: null
    };
  }
  componentWillMount(){
        if(!this.state.component){
          this.props.getComponent().then(component=>{
            this.setState({component})
          })
        }
  }

    render(){
      const Component = this.state.component;
      if(!Component){
        return null
      }
      return <Component data={this.props.data.data}/>
    }
}


export default LazyComponent;
