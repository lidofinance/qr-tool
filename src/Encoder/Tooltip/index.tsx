import React from "react";
import "./style.css";

function Tooltip(props: React.PropsWithChildren<{ text: string }>) {
  return (
    <>
      <span className="tooltip">
        <i className="tip">{props.text}</i>
        {props.children}
      </span>
    </>
  );
}

export default Tooltip;
