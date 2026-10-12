import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvFileName, toCsv } from "../lib/csv";

describe("query csv export", () => {
  it("writes a header and one row", () => {
    assert.equal(toCsv(["id", "name"], [{ id: 1, name: "Ada" }]), "id,name\r\n1,Ada");
  });

  it("quotes commas, quotes, and line breaks", () => {
    const csv = toCsv(["note"], [{ note: 'say "hi",\nthen leave' }]);
    assert.equal(csv, 'note\r\n"say ""hi"",\nthen leave"');
  });

  it("leaves null cells empty and serializes objects", () => {
    const csv = toCsv(["empty", "payload"], [{ empty: null, payload: { ok: true } }]);
    assert.equal(csv, 'empty,payload\r\n,"{""ok"":true}"');
  });

  it("names the file from the environment and time", () => {
    assert.equal(csvFileName("DEV", new Date("2026-10-12T13:05:09.000Z")), "dev-query-2026-10-12-13-05-09.csv");
  });
});
