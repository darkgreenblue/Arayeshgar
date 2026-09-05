import { describe, expect, it } from "vitest";
import { classifyHost } from "../src/lib/tenant";

describe("classifyHost", () => {
  it("resolves platform, tenant slug and custom domains with explicit precedence", () => {
    expect(classifyHost("platform.arayeshgar.ir", "arayeshgar.ir")).toEqual({ kind: "platform" });
    expect(classifyHost("ali.arayeshgar.ir:443", "arayeshgar.ir")).toEqual({
      kind: "tenant",
      slug: "ali",
    });
    expect(classifyHost("demo.localhost:3000", "arayeshgar.ir")).toEqual({
      kind: "tenant",
      slug: "demo",
    });
    expect(classifyHost("www.alibarber.ir", "arayeshgar.ir")).toEqual({
      kind: "custom",
      host: "www.alibarber.ir",
    });
    expect(classifyHost("a.b.arayeshgar.ir", "arayeshgar.ir")).toEqual({
      kind: "custom",
      host: "a.b.arayeshgar.ir",
    });
  });
});
