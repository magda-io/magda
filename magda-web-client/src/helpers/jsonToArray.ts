import traverse from "traverse";

export default function (jsonObj: any) {
    const array = traverse(jsonObj).reduce(function (this: any, acc) {
        if (this.notRoot && this.isLeaf) {
            acc.push({
                name: this.parent.key,
                value: this.node
            });
        }
        return acc;
    }, []);
    return array;
}
