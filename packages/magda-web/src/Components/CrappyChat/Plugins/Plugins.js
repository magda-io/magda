import UserMentionSearch from "./UserMention/UserMentionSearch";
import DataSetMentionSearch from "./DataSetMention/DataSetMentionSearch";
import createMentionPlugin from "draft-js-mention-plugin";

function userMentionPlugin() {
  return createMentionPlugin({
    mentionComponent: UserMentionSearch
  });
}

function dataSetMentionPlugin() {
  return createMentionPlugin({
    mentionComponent: DataSetMentionSearch,
    mentionPrefix: "#",
    mentionTrigger: "#"
  });
}

function plugins() {
  return {
    userMentions: userMentionPlugin(),
    dataSetMentions: dataSetMentionPlugin()
  };
}
export default plugins;
