import find from "lodash/find";

export default function (
    valueList: Array<string>,
    objList: Array<any>
): Array<any> {
    let list: Array<any> = [];
    function checkActiveOption(option: any) {
        return find(
            valueList,
            (o) => o.toLowerCase() === option.value.toLowerCase()
        );
    }
    list = objList.filter((o) => checkActiveOption(o));
    return list;
}
