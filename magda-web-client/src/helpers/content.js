import { connect } from "react-redux";

/**
 * Helper method to not have to put redux code everywhere to get content items
 *
 * Specify a list of arguments for either string property fields or mapStateToProps functions
 */
export function needsContent(...properties) {
    const mapStateToProps = (state) => {
        const output = {};
        properties.forEach((property) => {
            if (typeof property === "string") {
                output[property] = state.content[property];
            } else if (typeof property === "function") {
                Object.assign(output, property(state));
            }
        });
        return output;
    };
    return (Component) => connect(mapStateToProps)(Component);
}
