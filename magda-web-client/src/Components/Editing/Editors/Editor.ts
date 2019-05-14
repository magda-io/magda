/**
 * Abstract Editor. Can view or edit.
 */
export default interface Editor {
    edit: (
        value: any,
        onChange: Function,
        multiValues?: any,
        extraProps?: any
    ) => JSX.Element;
    view: (value: any) => JSX.Element;
}
