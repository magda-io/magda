// @flow
import React from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import {fetchConnectorsIfNeeded, updateConnectorStatus, deleteConnector, createConnector} from '../../actions/connectorsActions';
import type {ConnectorProps} from '../../actions/connectorsActions';
import ProgressBar from '../../UI/ProgressBar';
import Login from "../Account/Login";
import { Link } from "react-router";

import './Connectors.css';
const uuidV1 = require('uuid/v1');
type State = {
  newConnectorName: string,
  newConnectorType: string,
  newConnectorFormIsOpen: boolean,
  error: ?string
}

class Connectors extends React.Component {
  state: State = {
    newConnectorFormIsOpen: true,
    newConnectorName: '',
    newConnectorType: '',
    error: null
  };

  componentWillMount(){
    this.props.fetchConnectorsIfNeeded();
  }

  renderByUser(user){
    if(!user){
      return <div> <Link to="/account">Sign in</Link> as admin to veiw a list of connectors available</div>
    }
    else if(!user.isAdmin){
      return <div> not authorised </div>
    }
    return (<div>
              <table className='table'><tbody>
              <tr>
                <th>Name</th>
                <th>type</th>
                <th>url</th>
              </tr>
              {this.props.connectors.map(c=>this.renderConnector(c))}</tbody></table>
                <button className='btn btn-primary' onClick={()=>this.openConnectorForm()}>Create a new connector</button>
              {this.state.newConnectorFormIsOpen && this.renderConnectorForm()}
            </div>)
  }

  openConnectorForm(){
    this.setState({
      newConnectorFormIsOpen: true
    })
  }

  renderConnectorForm(){
    return  <div className='create-connector-form-wrapper'>
              <form className='create-connector-form'>
              {this.state.error && <div className="alert alert-danger">{this.state.error}</div>}
              <div>
                <label>
                    Name:
                </label>
                    <input type="text" name="name" onChange={(event)=>{this.setState({newConnectorName: event.target.value, error: null})}} value={this.state.newConnectorName}/>
              </div>
              <div>
                <label>
                    Type:
                </label>
                    <input type="text" name="type" onChange={(event)=>{this.setState({newConnectorType: event.target.value, error: null})}} value={this.state.newConnectorType}/>
                </div>
                <input type="button" value="Submit" onClick={()=>this.submitNewConnector()} className='btn btn-primary' />
            </form>
          </div>
  }

  submitNewConnector(){
    if(this.state.newConnectorName.length > 0 && this.state.newConnectorType.length > 0){
      this.props.createConnector({
        name: this.state.newConnectorName,
        type: this.state.newConnectorType,
        id: uuidV1()
      });
      this.setState({
        newConnectorFormIsOpen: false
      })
    } else{
      this.setState({
        error: "Field cannot be empty"
      })
    }

  }

  toggleConnector(connector){
    const action = connector.job ? 'stop' : 'start';
    this.props.updateConnectorStatus(connector.id, action)
  }

  deleteConnector(connector){
    this.props.deleteConnector(connector.id)
  }

  renderConnector(connector){
    return (<tr key={connector.id}>
    <td>{connector.name}</td>
    <td>{connector.type}</td>
    <td>{connector.sourceUrl}</td>
    <td><button className={`btn ${!connector.job ? 'btn-success': 'btn-warning'}`} type='button' onClick={this.toggleConnector.bind(this, connector)}>{!connector.job ? 'Start' : 'Stop'}</button></td>
    <td><button className='btn btn-danger' onClick={this.deleteConnector.bind(this, connector)}>Delete</button></td>
    </tr>)
  }

  render() {
    return (<div>
            {this.props.isFetching && <ProgressBar/>}
            <div className='container'>{this.renderByUser(this.props.user)}</div>
          </div>)
  }
}

function mapStateToProps(state) {
  let { userManagement: { user }} = state;
  let { connectors: { connectors, isFetching }} = state;

  return {
    user,
    connectors,
    isFetching
  };
}

const mapDispatchToProps = (dispatch: Dispatch<*>) => {
  return bindActionCreators(
    {fetchConnectorsIfNeeded,
    updateConnectorStatus,
    deleteConnector,
    createConnector},
    dispatch
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(Connectors);
