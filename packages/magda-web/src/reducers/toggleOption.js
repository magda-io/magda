const toggleOption= (option, action)=>{
  if(action.id === option.id){
    return Object.assign({}, option, {active: !option.active})
  }
}
export default toggleOption;
