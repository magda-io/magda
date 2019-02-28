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

        return this.props.children(C);
    }
}
