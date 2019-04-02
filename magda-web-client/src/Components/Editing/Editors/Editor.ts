/**
 * Abstract Editor. Can view or edit.
 */
export default interface Editor {
    edit: (value: any, onChange: Function) => JSX.Element;
    view: (value: any) => JSX.Element;
}
