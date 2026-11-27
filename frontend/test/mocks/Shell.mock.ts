import React from "react";

export default function Shell({ children }: { children: React.ReactNode }) {
  return React.createElement("div", null, children);
}
