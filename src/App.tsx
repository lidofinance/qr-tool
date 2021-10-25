import React, { useState } from "react";
import "./App.css";
import Encoder from "./Encoder";
import Decoder from "./Decoder";

import "bulma/css/bulma.min.css";

function App() {
  const [link, setLink] = useState("encoder");

  return (
    <div className="App">
      <div className="tabs">
        <ul>
          <li className={link === "encoder" ? "is-active" : ""}>
            <a onClick={() => setLink("encoder")}>Encoder</a>
          </li>
          <li className={link === "decoder" ? "is-active" : ""}>
            <a onClick={() => setLink("decoder")}>Decoder</a>
          </li>
        </ul>
      </div>
      <div>
        {link === "encoder" && <Encoder />}
        {link === "decoder" && <Decoder />}
      </div>
    </div>
  );
}

export default App;
