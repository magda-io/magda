import React from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import Login from "../Account/Login";

class Connectors extends React.Component {

  renderByUser(user){
    if(!user){
      return <Login
        signInError={
          this.props.location.state && this.props.location.state.signInError
        }
        providers={this.props.providers}
      />
    }
    else if(!user.isAdmin){
      return <div>unauthorised</div>
    }
    return <div className='connectors'>connectors</div>

  }

  render() {
    // return this.renderByUser(this.props.user);
    return this.renderByUser(this.props.user)
  }
}

function mapStateToProps(state) {
  let { userManagement: { user, providers, providersError } } = state;

  return {
    user,
    providers,
    providersError
  };
}

const mapDispatchToProps = (dispatch: Dispatch<*>) => {
  return bindActionCreators(
    {},
    dispatch
  );
};

export default connect(mapStateToProps, mapDispatchToProps)(Connectors);
