import type { CSSProperties } from "react";

type AppRegionStyle = CSSProperties & { WebkitAppRegion?: "drag" | "no-drag" };

const titlebarStyle: AppRegionStyle = { WebkitAppRegion: "drag" };
const controlsStyle: AppRegionStyle = { WebkitAppRegion: "no-drag" };

export default function Titlebar() {
  return (
    <div className="titlebar" style={titlebarStyle}>
      <div className="title">Smart Assistant</div>
      <div className="window-controls" style={controlsStyle}>
        <button className="dot red" title="Smart Assistant" />
      </div>
    </div>
  );
}
