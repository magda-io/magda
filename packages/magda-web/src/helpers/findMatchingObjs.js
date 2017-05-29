//@flow
import find from 'lodash.find';

export default function (valueList: Array<string>, objList: Array<T>) : Array<T>{
  let list:Array<T> = [];
  function checkActiveOption(option: Object){
    return find(valueList, o=> o.toLowerCase() === option.value.toLowerCase());
  }
  list = objList.filter(o=>checkActiveOption(o));
  return list;
}
