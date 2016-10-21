export default function (option, query) {
  /**
   * @exports checkActiveOption
   *
   * @param {Object} option The option to check
   * @returns {Array} query the query paramater in which we need to find out if the option exist. query might be a string or a list of strings
   *
   */
  if(!query){
    return false;
  }
  /// if query is already array, check if item exist in array already
  if(Array.isArray(query)){
    if(query.indexOf(option.value) < 0){
      return false;
    }
    return true;
  }
  // if query is string, check directly
  if(query === option.value){
    return true;
  }
  return false;
}
