import React, { Component } from "react";

import Spinner from "Components/Common/Spinner";

import {
    listConnectors,
    startConnector,
    stopConnector,
    deleteConnector
} from "actions/adminActions";
import AdminHeader from "Components/Admin/AdminHeader";

class StoriesAdminPage extends Component {
    state = {
        connectors: null
    };

    updateState(update: any) {
        this.setState((state, props) => Object.assign({}, state, update));
    }

    refresh() {
        this.updateState({ connectors: [] });
        listConnectors().then((connectors) => this.updateState({ connectors }));
    }

    componentDidMount() {
        this.refresh();
    }

    render() {
        const { connectors } = this.state;
        const sortedConnectors = (connectors || []).sort((a, b) =>
            a.name.toLowerCase() > b.name.toLowerCase() ? 1 : -1
        );
        return (
            <div>
                <AdminHeader title="Connectors" />
                <button className="au-btn" onClick={() => this.refresh()}>
                    Refresh
                </button>
                {!connectors ? (
                    <Spinner />
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Type</th>
                                <th>Status</th>
                                <th>URL</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedConnectors.map(
                                this.renderConnector.bind(this)
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        );
    }

    renderConnector(connector) {
        let status = (connector.job && connector.job.status) || "none";
        return (
            <tr>
                <td>{connector.name}</td>
                <td>
                    {connector.image.name.replace(/(^magda-|-connector)/g, "")}
                </td>
                <td>{status}</td>
                <td>{connector.sourceUrl}</td>
                <td>
                    {status !== "active" && (
                        <button
                            className="au-btn"
                            onClick={() => this.handleStartConnector(connector)}
                        >
                            Start
                        </button>
                    )}
                    {status === "active" && (
                        <button
                            className="au-btn"
                            onClick={() => this.handleStopConnector(connector)}
                        >
                            Stop
                        </button>
                    )}

                    <button
                        className="au-btn"
                        onClick={() => this.handleDeleteConnector(connector)}
                    >
                        Delete
                    </button>
                </td>
            </tr>
        );
    }

    handleStartConnector(connector) {
        startConnector(connector.id).then(this.refresh.bind(this));
    }

    handleStopConnector(connector) {
        stopConnector(connector.id).then(this.refresh.bind(this));
    }

    handleDeleteConnector(connector) {
        deleteConnector(connector.id).then(this.refresh.bind(this));
    }
}

export default StoriesAdminPage;
