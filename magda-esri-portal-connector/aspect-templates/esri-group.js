return {
    description: group.description,
    members: group.__members.map(memberId => {
        return "ds-" + transformer.sourceId + "-" + memberId;
    })
};
