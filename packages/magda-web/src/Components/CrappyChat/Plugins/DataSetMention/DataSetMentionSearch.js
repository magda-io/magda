import React from "react";

export default function DataSetMentionSearch(props) {
  return (
    <span
      key={props.mention.get("identifier")}
      style={{ background: "rgba(0, 0, 255, 0.2)" }}
      className={props.className}
      onClick={() => alert("Clicked on the Mention!")}
      contentEditable={false}
    >
      #{props.mention.get("title")}
    </span>
  );
}
