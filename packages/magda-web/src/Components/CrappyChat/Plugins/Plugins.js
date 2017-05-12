import UserMentionSearch from "./UserMention/UserMentionSearch";
import DataSetMentionSearch from "./DataSetMention/DataSetMentionSearch";
import createMentionPlugin from "draft-js-mention-plugin";

function userMentionPlugin() {
  return createMentionPlugin({
    mentionComponent: UserMentionSearch,
    mentionTrigger: "@",
    mentionRegExp: "[\\w\\s]{0,20}",
    entityMutability: "IMMUTABLE"
  });
}

function dataSetMentionPlugin() {
  return createMentionPlugin({
    mentionComponent: DataSetMentionSearch,
    mentionTrigger: "#",
    mentionRegExp: "[\\w\\s]{0,20}",
    entityMutability: "IMMUTABLE"
  });
}

function plugins() {
  return {
    userMentions: userMentionPlugin(),
    dataSetMentions: dataSetMentionPlugin()
  };
}
export default plugins;
