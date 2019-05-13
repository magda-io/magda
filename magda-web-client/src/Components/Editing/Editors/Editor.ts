/**
 * Abstract Editor. Can view or edit.
 */
export default interface Editor {
    edit: (value: any, onChange: Function, multiValues?: any) => JSX.Element;
    view: (value: any) => JSX.Element;
}
