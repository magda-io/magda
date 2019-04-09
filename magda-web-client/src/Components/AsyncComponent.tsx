import React, { Component, ReactNode, Fragment } from "react";

type Props<C extends Component> = {
    importComponent: () => Promise<new (...args: any[]) => C>;
    children: (wrappedComponent: (new () => C) | undefined) => ReactNode;
};

type State<C extends Component> = {
    component?: new () => C;
};

export default class AsyncComponent<C extends Component> extends Component<
    Props<C>,
    State<C>
> {
    state: State<C> = {
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
        return <C />;
    }
}

export function makeAsync(importComponent: Function) {
    return class extends React.Component {
        render() {
            return <AsyncComponent importComponent={importComponent} />;
        }
    };
}
