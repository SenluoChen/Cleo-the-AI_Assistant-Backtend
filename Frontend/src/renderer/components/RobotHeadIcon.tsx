import React from "react";

export function RobotHeadIcon({
  size = 28,
  className
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="robot"
    >
      {/* antenna */}
      <circle cx="32" cy="11" r="3.2" fill="#ffffff" />
      <path d="M32 14v7" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />

      {/* head */}
      <rect x="8" y="16" width="48" height="40" rx="20" fill="#ffffff" />
      <circle cx="12" cy="34" r="2.6" fill="#ffffff" />
      <circle cx="52" cy="34" r="2.6" fill="#ffffff" />

      {/* face */}
      <rect x="16" y="26" width="32" height="20" rx="10" fill="#0B3A7A" />

      {/* eyes */}
      <circle cx="26" cy="36" r="4.2" fill="#ffffff" />
      <circle cx="38" cy="36" r="4.2" fill="#ffffff" />
      <circle cx="26" cy="36" r="2" fill="#2B7CFF" />
      <circle cx="38" cy="36" r="2" fill="#2B7CFF" />

      {/* highlight */}
      <path
        d="M18 29c5-7 14-10 24-8"
        fill="none"
        stroke="#0B3A7A"
        strokeOpacity="0.10"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}
