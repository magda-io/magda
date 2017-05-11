import React from "react";

export default function DataSetMentionSearch(props) {
  console.log(props);

  return (
    <span
      style={{ background: "rgba(0, 0, 255, 0.2)" }}
      className={props.className}
      onClick={() => alert("Clicked on the Mention!")}
    >
      #{props.mention.get("title")}
    </span>
  );
}
