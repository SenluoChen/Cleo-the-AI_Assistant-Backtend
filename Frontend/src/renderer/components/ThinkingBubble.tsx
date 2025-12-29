export function ThinkingBubble() {
  // Render only the internal thinking dots wrapper so it can be
  // placed inside an existing message bubble instead of creating
  // a separate bubble container.
  return (
    <div className="thinking-bubble">
      <span className="dot" style={{ animationDelay: "0ms" }}></span>
      <span className="dot" style={{ animationDelay: "150ms" }}></span>
      <span className="dot" style={{ animationDelay: "300ms" }}></span>
    </div>
  );
}
