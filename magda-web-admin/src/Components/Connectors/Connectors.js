// @flow
import React from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import {
    fetchConnectorsIfNeeded,
    updateConnectorsStatus,
    deleteConnector,
    createNewConnector,
    validateConnectorName,
    validateConnectorType,
    resetConnectorForm
} from "../../actions/connectorsActions";
import ProgressBar from "../../UI/ProgressBar";
import { Link } from "react-router-dom";
import { Redirect } from "react-router-dom";

import "./Connectors.css";
type State = {
    newConnectorName: string,
    newConnectorType: string,
    newConnectorFormIsOpen: boolean
};

class Connectors extends React.Component {
    state: State = {
        newConnectorFormIsOpen: false,
        newConnectorName: "",
        newConnectorType: ""
    };

    componentWillMount() {
        this.props.fetchConnectorsIfNeeded();
    }

    renderByUser(user) {
        if (!user) {
            return (
                <Redirect
                    to={{
                        pathname: "/account",
                        state: { from: this.props.location }
                    }}
                />
            );
        } else if (!user.isAdmin) {
            return <div> not authorised </div>;
        }
        return (
            <div>
                <div className="header">
                    <button
                        className="btn btn-primary"
                        onClick={() => this.openConnectorForm()}
                    >
                        Create a new connector
                    </button>
                </div>
                <table className="table">
                    <tbody>
                        <tr>
                            <th>Name</th>
                            <th>type</th>
                            <th>url</th>
                            <th>action</th>
                            <th>job status</th>
                            <th>remove</th>
                        </tr>
                        {this.props.connectors.map(c =>
                            this.renderConnector(c)
                        )}
                    </tbody>
                </table>
                {this.state.newConnectorFormIsOpen &&
                    this.renderConnectorForm()}
            </div>
        );
    }

    openConnectorForm() {
        this.setState({
            newConnectorName: "",
            newConnectorType: "",
            newConnectorFormIsOpen: true
        });
    }

    closeConnectorForm() {
        this.props.resetConnectorForm();
        this.setState({
            newConnectorFormIsOpen: false
        });
    }

    renderConnectorForm() {
        const disableSubmit =
            this.props.error ||
            this.props.isFetching ||
            !this.state.newConnectorName.length ||
            !this.state.newConnectorType.length;
        return (
            <div
                className="create-connector-form-wrapper"
                onClick={() => {
                    this.closeConnectorForm();
                }}
            >
                <form
                    className="create-connector-form"
                    onClick={event => {
                        event.stopPropagation();
                    }}
                >
                    {this.props.error && (
                        <div className="alert alert-danger">
                            {this.props.error}
                        </div>
                    )}
                    <div>
                        <label>Name:</label>
                        <input
                            type="text"
                            name="name"
                            onBlur={event => {
                                this.validateField(event.target.value, "name");
                            }}
                            onChange={event => {
                                this.setState({
                                    newConnectorName: event.target.value,
                                    error: null
                                });
                            }}
                            value={this.state.newConnectorName}
                        />
                    </div>
                    <div>
                        <label>Type:</label>
                        <input
                            type="text"
                            name="type"
                            onBlur={event => {
                                this.validateField(event.target.value, "type");
                            }}
                            onChange={event => {
                                this.setState({
                                    newConnectorType: event.target.value,
                                    error: null
                                });
                            }}
                            value={this.state.newConnectorType}
                        />
                    </div>
                    <input
                        type="button"
                        value="Submit"
                        onClick={() => this.submitNewConnector()}
                        disabled={disableSubmit}
                        className="btn btn-primary"
                    />
                </form>
            </div>
        );
    }

    validateField(value, type) {
        if (type === "name") {
            this.props.validateConnectorName(value);
        } else if (type === "type") {
            this.props.validateConnectorType(value);
        }
    }

    submitNewConnector() {
        this.props.createNewConnector({
            name: this.state.newConnectorName,
            type: this.state.newConnectorType,
            id: encodeURI(this.state.newConnectorName)
        });
        this.setState({
            newConnectorFormIsOpen: false
        });
    }

    toggleConnector(connector) {
        const action =
            connector.job && connector.job.status === "active"
                ? "stop"
                : "start";
        this.props.updateConnectorsStatus(connector.id, action);
    }

    deleteConnector(connector) {
        this.props.deleteConnector(connector.id);
    }

    renderConnector(connector) {
        return (
            <tr
                key={connector.id}
                className={`${
                    connector.name === this.state.newConnectorName
                        ? "success"
                        : ""
                }`}
            >
                <td>{connector.name}</td>
                <td>{connector.type}</td>
                <td>{connector.sourceUrl}</td>
                <td>
                    <button
                        className={`btn ${
                            connector.job && connector.job.status === "active"
                                ? "btn-warning "
                                : "btn-success"
                        }`}
                        type="button"
                        onClick={this.toggleConnector.bind(this, connector)}
                    >
                        {connector.job && connector.job.status === "active"
                            ? "Stop"
                            : "Start"}
                    </button>
                </td>
                <td className={connector.job ? connector.job.status : ""}>
                    {connector.job && connector.job.status}
                </td>
                <td>
                    <button
                        className="btn btn-danger"
                        onClick={this.deleteConnector.bind(this, connector)}
                    >
                        Delete
                    </button>
                </td>
                <td>
                    <Link to={`/connectors/${connector.id}`}>Edit</Link>
                </td>
            </tr>
        );
    }

    render() {
        return (
            <div className="connectors">
                {this.props.isFetching && <ProgressBar />}
                <div className="container">
                    {this.renderByUser(this.props.user)}
                </div>
            </div>
        );
    }
}

function mapStateToProps(state) {
    let { userManagement: { user } } = state;
    let { connectors: { connectors, isFetching, error } } = state;
    return {
        user,
        connectors,
        isFetching,
        error
    };
}

const mapDispatchToProps = (dispatch: Dispatch<*>) => {
    return bindActionCreators(
        {
            fetchConnectorsIfNeeded,
            updateConnectorsStatus,
            deleteConnector,
            createNewConnector,
            validateConnectorName,
            validateConnectorType,
            resetConnectorForm
        },
        dispatch
    );
};

export default connect(mapStateToProps, mapDispatchToProps)(Connectors);
