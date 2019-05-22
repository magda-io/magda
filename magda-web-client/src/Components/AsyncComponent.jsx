import React, { Component, Fragment } from "react";

export default class AsyncComponent extends Component {
    state = {
        component: undefined
    };

    mounted = false;

    async componentDidMount() {
        this.mounted = true;
        const component = await this.props.importComponent();

        if (this.mounted) {
            this.setState({
                component
            });
        }
    }

    componentWillUnmount() {
        this.mounted = false;
    }

    render() {
        const C = this.state.component;

        if (!C) {
            return <Fragment>Loading...</Fragment>;
        }
        return <C {...this.props} />;
    }
}

export function makeAsync(importComponent: Function) {
    return class extends React.Component {
        render() {
            return <AsyncComponent importComponent={importComponent} />;
        }
    };
}
