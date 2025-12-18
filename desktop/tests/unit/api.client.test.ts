import { describe, it, expect } from "vitest";
import { analyze } from "../../src/renderer/api/client";

describe("analyze API", () => {
  it("should throw on invalid endpoint", async () => {
  await expect(analyze({ question: "test" })).rejects.toThrow();
  });
});
