import Mention from "./AtMention";
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
      mention: mentionPlugin()
  };
}
export default plugins;
