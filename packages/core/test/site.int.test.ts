import { afterAll, describe, expect, it } from "vitest";
import { loadSiteContent } from "../src/tenant/site";
import { sniffImage, createDiskStorage } from "../src/storage/disk";
import { hasDb, makeTenant, testDb, type Fixture } from "./helpers/db";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("storage", () => {
  it("sniffs image types and rejects others", () => {
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(
      "image/jpeg",
    );
    expect(
      sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])),
    ).toBe("image/png");
    expect(sniffImage(Buffer.from("RIFF0000WEBPVP8 "))).toBe("image/webp");
    expect(sniffImage(Buffer.from("%PDF-1.4 hello world"))).toBeNull();
  });
  it("saves under tenant/yyyy/mm and refuses path escapes", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ar-uploads-"));
    const st = createDiskStorage(dir);
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
    const saved = await st.saveImage("tenant-1", jpg);
    expect(saved.key).toMatch(/^tenant-1\/\d{4}\/\d{2}\/[0-9a-f-]+\.jpg$/);
    expect(await st.exists(saved.key)).toBe(true);
    expect(() => st.absolutePath("../../etc/passwd")).toThrow();
    await expect(st.saveImage("t", Buffer.from("not an image at all"))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe.skipIf(!hasDb)("site content (Postgres)", () => {
  const db = hasDb ? testDb() : (null as never);
  const fixtures: Fixture[] = [];
  afterAll(async () => {
    for (const f of fixtures) await f.cleanup();
  });
  it("bundles services, staff and opening hours", async () => {
    const f = await makeTenant(db, { mode: "salon_central" });
    fixtures.push(f);
    const c = await loadSiteContent(db, f.tenant);
    expect(c.services.map((s) => s.name)).toEqual(["اصلاح"]);
    expect(c.staff).toHaveLength(2);
    expect(c.showStaffPicker).toBe(true);
    expect(c.hours).toHaveLength(7);
    expect(c.hours[0]!.ranges[0]).toBe("۰۹:۰۰ تا ۲۱:۰۰");
  });
});
