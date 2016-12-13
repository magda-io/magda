export default function (valueList, objList) {
  let list = [];
  function checkActiveOption(option){
    return find(valueList, o=> o.toLowerCase() === option.value.toLowerCase());
  }
  list = objList.filter(o=>checkActiveOption(o));
  return list;
}
