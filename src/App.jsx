import React, { useState } from "react";
import TireWear from "./TireWear.jsx";
import Identify from "./Identify.jsx";
import { readWho, clearWho } from "./identity.js";

export default function App() {
  const [who, setWho] = useState(readWho);

  if (!who) return <Identify onDone={setWho} />;

  return (
    <TireWear
      who={who}
      onSwitchUser={() => {
        clearWho();
        setWho(null);
      }}
    />
  );
}
