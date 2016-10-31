/*global define*/
define(function() {
    /**
     * @exports defined
     *
     * @param {Object} value The object.
     * @returns {Boolean} Returns true if the object is defined, returns false otherwise.
     *
     */
    function defined(value) {
        return value !== undefined && value !== null;
    }

    return defined;
});
