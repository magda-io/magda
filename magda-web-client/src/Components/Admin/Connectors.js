import React from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import {fetchConnectorsIfNeeded, updateConnectorStatus, deleteConnector} from '../../actions/connectorsActions';
import ProgressBar from '../../UI/ProgressBar';
import Login from "../Account/Login";
import { Link } from "react-router";

class Connectors extends React.Component {
  constructor(props) {
   super(props);
   this.state = {newConnectorFormIsOpen: true};
 }

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
              <table className='table'><tbody>{this.props.connectors.map(c=>this.renderConnector(c))}</tbody></table>
              <button className='btn btn-primary' onClick={this.openConnectorForm}>Create a new connector</button>
              {this.state.newConnectorFormIsOpen && this.renderConnectorForm()}
            </div>)
  }

  openConnectorForm(){
    this.setState({
      newConnectorFormIsOpen: true
    })
  }

  renderConnectorForm(){
    return <form>
              <label>
                  Name:
                  <input type="text" name="name" />
              </label>
              <label>
                  Type:
                  <input type="text" name="type" />
              </label>
                <input type="submit" value="Submit" className='btn btn-primary' />
            </form>
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
    <td>{connector.schedule}</td>
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
    deleteConnector},
    dispatch
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(Connectors);
