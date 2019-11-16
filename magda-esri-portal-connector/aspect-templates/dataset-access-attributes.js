const groupInfo = dataset.groups || {};
const groups = (groupInfo.admin || [])
    .concat(groupInfo.member || [])
    .concat(groupInfo.other || []);

return {
    groups: groups.map(group => group.id),
    owner: dataset.owner,
    access: dataset.access
};
