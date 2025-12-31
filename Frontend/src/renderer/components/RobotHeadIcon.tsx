import React from "react";

export function RobotHeadIcon({
  size = 28,
  className
}: {
  size?: number;
  className?: string;
}) {
  const logoUrl = `${import.meta.env.BASE_URL}cleo-logo.png`;
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      className={className}
      alt="Cleo"
      draggable={false}
      style={{ display: "block" }}
    />
  );
}
