import { test } from "node:test";
import assert from "node:assert/strict";
import { addImagePart, fillWordTemplate, imageMarks, imageRun, imageSize, managesTemplates, seesTemplate, templateFields } from "../src/word-templates.ts";

// a paragraph as Word writes it: the text cut into runs anywhere, a blank split over three of them
const run = (t: string, bold = false) => `<w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${t}</w:t></w:r>`;
const p = (...runs: string[]) => `<w:p><w:pPr><w:bidi/></w:pPr>${runs.join("")}</w:p>`;
const doc = (...ps: string[]) => `<w:document><w:body>${ps.join("")}<w:sectPr/></w:body></w:document>`;
const text = (xml: string) => [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => [...m[0].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((x) => x[1]).join(""));

// shaped like the client's «مطالبة مالية» (25 Nov), with made-up words
const CLAIM = doc(
  p(run("مطالبة مالية", true)),
  p(run("تاريخ تقديم المطالبة : "), run("…/…./……")),
  p(run("السادة /  ……"), run("………..")),
  p(run("تحية طيبة و بعد ...")),
  p(run("العمولة بقيمة ( "), run("……", true), run("….. ) جنيه مصري")),
  p(run("التوقيع : {{الإمضا}}")),
  p(run("ختم الشركة : {{"), run("الختم}}")),
  p(run("اسم العميل: {{ اسم العميل }}")),
);

test("templateFields: every blank and every {{name}}, in order, labelled by the words before it; the stamp and signature aren't fields", () => {
  const f = templateFields(CLAIM);
  assert.deepEqual(f.map((x) => [x.id, x.label, x.named]), [
    [1, "تاريخ تقديم المطالبة", false], [2, "تاريخ تقديم المطالبة (2)", false], [3, "تاريخ تقديم المطالبة (3)", false], // the date's three parts
    [4, "السادة", false], // split over two runs: one blank
    [5, "تحية طيبة و بعد", false], // «...» after «و بعد»: the manager marks it «مش خانة»
    [6, "العمولة بقيمة", false], // across three runs, one of them bold
    [7, "اسم العميل", true],
  ]);
  assert.match(f[3]!.context, /السادة \/ \[ \]/);
});

test("imageMarks: where the stamp and the signature go, even when Word split «{{الختم}}» over two runs", () => {
  assert.deepEqual(imageMarks(CLAIM), { stamp: true, signature: true });
  assert.deepEqual(imageMarks(doc(p(run("لا شيء")))), { stamp: false, signature: false });
});

test("fillWordTemplate: values go where the blanks were, the runs around keep their formatting; empty or skipped fields keep their dots", () => {
  const out = fillWordTemplate(CLAIM, { 1: "5", 2: "11", 3: "2026", 4: "شركة المثال", 6: "50,000", 7: "عميل & شركاه" });
  const t = text(out);
  assert.equal(t[1], "تاريخ تقديم المطالبة : 5/11/2026");
  assert.equal(t[2], "السادة /  شركة المثال");
  assert.equal(t[3], "تحية طيبة و بعد ..."); // field 5 left empty: as it was
  assert.equal(t[4], "العمولة بقيمة ( 50,000 ) جنيه مصري");
  assert.equal(t[7], "اسم العميل: عميل &amp; شركاه"); // escaped for the XML
  assert.ok(out.includes("<w:rPr><w:b/></w:rPr><w:t xml:space=\"preserve\">50,000</w:t>")); // the bold run got the value
  assert.equal(t[5], "التوقيع : "); // no signature image: the mark is gone
  assert.equal(t[6], "ختم الشركة : ");
});

test("fillWordTemplate: the stamp's picture run goes where «{{الختم}}» was, the text after it carries on", () => {
  const xml = doc(p(run("ختم الشركة : {{الختم}} شكراً")));
  const out = fillWordTemplate(xml, {}, { stamp: "<w:r><w:drawing>STAMP</w:drawing></w:r>" });
  assert.ok(out.includes("ختم الشركة : </w:t></w:r><w:r><w:drawing>STAMP</w:drawing></w:r><w:r><w:t xml:space=\"preserve\"> شكراً</w:t>"));
});

test("fillWordTemplate leaves a file with no fields exactly as it was", () => {
  const xml = doc(p(run("نص ثابت")), "<w:tbl><w:tr><w:tc>" + p(run("خلية")) + "</w:tc></w:tr></w:tbl>");
  assert.equal(fillWordTemplate(xml, { 1: "x" }), xml);
});

test("imageSize reads a PNG's and a JPEG's size", () => {
  const png = new Uint8Array(24); png.set([0x89, 0x50, 0x4e, 0x47]); png.set([0, 0, 1, 44], 16); png.set([0, 0, 0, 150], 20);
  assert.deepEqual(imageSize(png), { width: 300, height: 150 });
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0, 120, 0, 200, 3, 0, 0]);
  assert.deepEqual(imageSize(jpg), { width: 200, height: 120 });
  assert.equal(imageSize(new Uint8Array([1, 2, 3])), null);
});

test("who sees a template: the roles or people the manager picked; nobody picked = everyone. Who sets them up: Super Admin, Office Manager", () => {
  assert.equal(seesTemplate({ seeRoles: [], seeUserIds: [] }, { id: "u", roles: ["sales"] }), true);
  assert.equal(seesTemplate({ seeRoles: ["sales"], seeUserIds: [] }, { id: "u", roles: ["sales", "tl"] }), true);
  assert.equal(seesTemplate({ seeRoles: ["ops"], seeUserIds: ["x"] }, { id: "u", roles: ["sales"] }), false);
  assert.equal(seesTemplate({ seeRoles: ["ops"], seeUserIds: ["u"] }, { id: "u", roles: ["sales"] }), true);
  assert.equal(managesTemplates(["officemgr"]), true);
  assert.equal(managesTemplates(["admin"]), true);
  assert.equal(managesTemplates(["sales", "tl"]), false);
});

test("the stamp's picture: one relationship and one content type per extension, and a run that points at it", () => {
  const parts = { rels: `<Relationships xmlns="x"><Relationship Id="rId1" Target="styles.xml"/></Relationships>`, types: `<Types xmlns="y"><Default Extension="xml" ContentType="application/xml"/></Types>` };
  const once = addImagePart(parts, { relId: "rIdPlaces1", target: "media/places-stamp.png", ext: "png", mime: "image/png" });
  assert.match(once.rels, /<Relationship Id="rIdPlaces1" Type="[^"]+\/image" Target="media\/places-stamp.png"\/><\/Relationships>$/);
  assert.match(once.types, /<Default Extension="png" ContentType="image\/png"\/>/);
  const twice = addImagePart(once, { relId: "rIdPlaces2", target: "media/places-signature.png", ext: "png", mime: "image/png" });
  assert.equal(twice.types, once.types); // png declared once
  assert.equal(addImagePart(twice, { relId: "rIdPlaces2", target: "x", ext: "png", mime: "image/png" }).rels, twice.rels); // no duplicate id
  const r = imageRun("rIdPlaces1", 1, { width: 400, height: 200 }, 4);
  assert.match(r, /r:embed="rIdPlaces1"/);
  assert.match(r, /<wp:extent cx="1440000" cy="720000"\/>/); // 4 cm wide, half as tall
  assert.match(r, /xmlns:wp=/);
});
