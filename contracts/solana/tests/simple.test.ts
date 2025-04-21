import * as anchor from "@project-serum/anchor";
import { assert } from "chai";

describe("Simple Test", () => {
  it("should run a simple test", () => {
    assert.equal(1 + 1, 2, "Basic math should work");
  });

  it("should pass with async code", async () => {
    const result = await Promise.resolve(true);
    assert.isTrue(result, "Async resolution should work");
  });
}); 