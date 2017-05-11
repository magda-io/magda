import Mention from "./UserMention/UserMentionSearch";
import createMentionPlugin, {
  defaultSuggestionsFilter
} from "draft-js-mention-plugin";

function mentionPlugin() {
  return createMentionPlugin({
    mentionComponent: Mention
  });
}

function plugins() {
  return {
      userMentions: mentionPlugin()
  };
}
export default plugins;
