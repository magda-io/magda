import React from "react";
import { connect } from "react-redux";
import { Link } from "react-router";
import { bindActionCreators } from "redux";
import {fetchConnectorsIfNeeded} from '../../actions/connectorsActions';
import Login from "../Account/Login";

class Connectors extends React.Component {
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
    return <table className='table'><tbody>{this.props.connectors.map(c=>this.renderConnector(c))}</tbody></table>
  }

  renderConnector(connector){
    return <tr key={connector.id}><td>{connector.name}</td><td>{connector.schedule}</td><td>{connector.sourceUrl}</td><td><button className='btn btn-success' type='button'>Start</button></td><td><button className='btn btn-danger'>Delete</button></td></tr>
  }

  render() {
    // return this.renderByUser(this.props.user);
    return <div className='container'>{this.renderByUser(this.props.user)}</div>
  }
}

function mapStateToProps(state) {
  let { userManagement: { user }} = state;
  let { connectors: { connectors }} = state;

  return {
    user,
    connectors
  };
}

const mapDispatchToProps = (dispatch: Dispatch<*>) => {
  return bindActionCreators(
    {fetchConnectorsIfNeeded: fetchConnectorsIfNeeded},
    dispatch
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(Connectors);
