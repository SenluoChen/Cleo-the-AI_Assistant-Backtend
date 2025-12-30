import React from "react";

export function RobotHeadIcon({
  size = 28,
  className
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      src="/cleo-logo.png"
      width={size}
      height={size}
      className={className}
      alt="Cleo"
      draggable={false}
      style={{ display: "block" }}
    />
  );
}
