//import UserMention from './UserMention/UserMention';
//import DataSetMention from "./DataSetMention/DataSetMention";
//import createMentionPlugin from "draft-js-mention-plugin";

// function userMentionPlugin() {
//   return createMentionPlugin({
//     mentionComponent: UserMention,
//     mentionTrigger: '@',
//     mentionRegExp: '[\\w\\s]{0,20}',
//     entityMutability: 'IMMUTABLE'
//   });
// }

/*function dataSetMentionPlugin() {
    return createMentionPlugin({
        mentionComponent: DataSetMention,
        mentionTrigger: "#",
        mentionRegExp: "[\\w\\s]{0,20}",
        entityMutability: "IMMUTABLE"
    });
}*/

function plugins() {
    return {
        // userMentions: userMentionPlugin(),
        // dataSetMentions: dataSetMentionPlugin()
    };
}
export default plugins;
