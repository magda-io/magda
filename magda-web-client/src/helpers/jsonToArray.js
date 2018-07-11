//@flow
import traverse from "traverse";

export default function(jsonObj: Object) {
    const array = traverse(jsonObj).reduce(function(acc) {
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
