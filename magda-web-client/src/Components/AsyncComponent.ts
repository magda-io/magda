import { Component, ReactNode } from "react";

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

    async componentDidMount() {
        this.setState({
            component: await this.props.importComponent()
        });
    }

    render() {
        const C = this.state.component;

        return this.props.children(C);
    }
}
