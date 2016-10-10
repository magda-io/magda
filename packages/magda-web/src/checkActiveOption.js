export default function (option, query) {
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
