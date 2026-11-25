/**
 * «المستندات» (client, 25 Nov): Word templates the manager uploads as they are. A field is a blank she left in the
 * file — dots or «…» («السادة / ……………..») — or a name in double braces («{{اسم العميل}}»); the system finds them,
 * she names each one or marks it «مش خانة» (an ellipsis that is only punctuation), and whoever issues the document
 * fills them by hand. «{{الختم}}» and «{{الإمضا}}» are where the company's stamp and signature go when the template
 * prints them.
 *
 * Pure string work on word/document.xml: a paragraph's text is spread over runs (<w:t>) that Word splits anywhere,
 * so a blank is found in the paragraph's whole text and written back into the runs it covers, keeping every other
 * run (and its formatting) as it was.
 */

/** A blank: 3+ dots, or any run of dots and «…» with at least one «…» in it. */
const BLANK = /[.…]*…[.…]*|\.{3,}/g;
const NAMED = /\{\{\s*([^{}]+?)\s*\}\}/g;
export const STAMP_MARK = "الختم";
export const SIGNATURE_MARK = "الإمضا";
const IMAGE_MARKS: readonly string[] = [STAMP_MARK, SIGNATURE_MARK];

export interface TemplateField {
  /** its place in the document (1, 2, 3…): stable as long as the file is the same */
  readonly id: number;
  /** what the form calls it: the name in braces, or the words just before the blank («تاريخ تقديم المطالبة») */
  readonly label: string;
  /** the words around it, so the manager knows which blank it is */
  readonly context: string;
  readonly named: boolean;
}

interface TextNode { start: number; end: number; open: string; text: string }
interface Para { start: number; end: number; xml: string }

const paragraphs = (xml: string): Para[] =>
  [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((m) => ({ start: m.index, end: m.index + m[0].length, xml: m[0] }));

/** The paragraph's text nodes: `<w:t>` or `<w:t xml:space="preserve">` (not <w:tab/>, <w:tbl>). */
const textNodes = (p: string): TextNode[] =>
  [...p.matchAll(/(<w:t(?:\s[^>]*)?>)([^<]*)<\/w:t>/g)].map((m) => ({ start: m.index, end: m.index + m[0].length, open: m[1]!, text: m[2]! }));

const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
/**
 * Text for a `<w:t>`. Characters XML 1.0 forbids (a pasted Word line break \v, other C0 controls, U+FFFE/FFFF) would
 * make the file one Word calls damaged: line breaks and tabs become a space (a field is one line), the rest go.
 */
export const escapeXml = (s: string) => s
  .replace(/[\t\n\v\f\r]/g, " ").replace(/[\u0000-\u0008\u000E-\u001F￾￿]/g, "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface Hit { from: number; to: number; named: string | null }

/** Every blank and named mark in one paragraph's joined text, in order. */
function hits(text: string): Hit[] {
  const named = [...text.matchAll(NAMED)].map((m) => ({ from: m.index, to: m.index + m[0].length, named: m[1]!.trim() }));
  const blanks = [...text.matchAll(BLANK)].map((m) => ({ from: m.index, to: m.index + m[0].length, named: null }))
    .filter((b) => !named.some((n) => b.from < n.to && b.to > n.from));
  return [...named, ...blanks].sort((a, b) => a.from - b.from);
}

/**
 * The words between the previous field and this one: the label it starts with («تاريخ تقديم المطالبة : …» →
 * «تاريخ تقديم المطالبة»). Nothing but separators (the date's «…/…./……»): the previous label, numbered.
 */
function labelBefore(text: string, from: number, at: number): string {
  const before = unescape(text.slice(from, at)).replace(/[\s:：/(\-–—]+$/u, "").replace(/^[\s:：/)\-–—]+/u, "").trim();
  return before.split(/\s+/).filter(Boolean).slice(-5).join(" ");
}

function contextOf(text: string, h: Hit): string {
  const t = unescape(text), a = Math.max(0, h.from - 30), b = Math.min(t.length, h.to + 30);
  return `${a > 0 ? "…" : ""}${t.slice(a, h.from)}[ ]${t.slice(h.to, b)}${b < t.length ? "…" : ""}`.replace(/\s+/g, " ").trim();
}

/** The fields of a template (the stamp and signature marks aren't fields), numbered in document order. */
export function templateFields(documentXml: string): TemplateField[] {
  const out: TemplateField[] = [];
  for (const p of paragraphs(documentXml)) {
    const text = textNodes(p.xml).map((n) => n.text).join("");
    let prevEnd = 0, prevLabel = "", part = 1;
    for (const h of hits(text)) {
      if (h.named && IMAGE_MARKS.includes(h.named)) { prevEnd = h.to; continue; }
      const own = h.named ?? labelBefore(text, prevEnd, h.from);
      const label = own || (prevLabel ? `${prevLabel} (${++part})` : `خانة ${out.length + 1}`);
      if (own) { prevLabel = own; part = 1; }
      out.push({ id: out.length + 1, label, context: contextOf(text, h), named: !!h.named });
      prevEnd = h.to;
    }
  }
  return out;
}

/** Does the file mark a place for the stamp or the signature? */
export const imageMarks = (documentXml: string): { stamp: boolean; signature: boolean } => {
  const text = paragraphs(documentXml).map((p) => textNodes(p.xml).map((n) => n.text).join("")).join("\n");
  const names = [...text.matchAll(NAMED)].map((m) => m[1]!.trim());
  return { stamp: names.includes(STAMP_MARK), signature: names.includes(SIGNATURE_MARK) };
};

/**
 * The filled document.xml. `values` by field id: a field left empty (or skipped by the manager) keeps its dots, to be
 * filled by pen. `images`: the run to put where «{{الختم}}» / «{{الإمضا}}» are (a <w:drawing> run); a mark with no
 * image is removed.
 */
export function fillWordTemplate(documentXml: string, values: Readonly<Record<number, string>>, images: { stamp?: string; signature?: string } = {}): string {
  let id = 0, out = "", last = 0;
  for (const p of paragraphs(documentXml)) {
    const nodes = textNodes(p.xml), text = nodes.map((n) => n.text).join("");
    const edits: Array<{ from: number; to: number; text: string; image?: string }> = [];
    for (const h of hits(text)) {
      if (h.named && IMAGE_MARKS.includes(h.named)) {
        const image = h.named === STAMP_MARK ? images.stamp : images.signature;
        edits.push({ from: h.from, to: h.to, text: "", ...(image ? { image } : {}) });
        continue;
      }
      const v = values[++id]?.trim();
      if (v) edits.push({ from: h.from, to: h.to, text: escapeXml(v) });
    }
    out += documentXml.slice(last, p.start) + (edits.length ? rewrite(p.xml, nodes, edits) : p.xml);
    last = p.end;
  }
  return out + documentXml.slice(last);
}

/** Writes each edit into the text nodes it covers: its text goes in the first, the rest of the span is cut. */
function rewrite(xml: string, nodes: TextNode[], edits: Array<{ from: number; to: number; text: string; image?: string }>): string {
  const texts = nodes.map((n) => n.text), after = nodes.map(() => "");
  let base = 0;
  const offsets = nodes.map((n) => { const o = base; base += n.text.length; return o; });
  for (const e of [...edits].reverse()) {
    for (let i = nodes.length - 1; i >= 0; i--) {
      const s = offsets[i]!, t = s + nodes[i]!.text.length;
      if (t <= e.from || s >= e.to) continue;
      const a = Math.max(e.from, s) - s, b = Math.min(e.to, t) - s, first = e.from >= s;
      texts[i] = texts[i]!.slice(0, a) + (first ? e.text : "") + texts[i]!.slice(b);
      // an image breaks the run where the mark began: the text after it goes on in a run of its own
      if (first && e.image) {
        const cut = a + e.text.length;
        after[i] = `</w:t></w:r>${e.image}<w:r><w:t xml:space="preserve">${texts[i]!.slice(cut)}${after[i]}`;
        texts[i] = texts[i]!.slice(0, cut);
      }
    }
  }
  let out = "", last = 0;
  nodes.forEach((n, i) => {
    const open = n.open.includes("xml:space") ? n.open : n.open.replace("<w:t", "<w:t xml:space=\"preserve\"");
    out += xml.slice(last, n.start) + `${open}${texts[i]}${after[i]}</w:t>`;
    last = n.end;
  });
  return out + xml.slice(last);
}

/** A PNG's or JPEG's size in pixels, to keep the stamp's proportions; null if it isn't one. */
export function imageSize(b: Uint8Array): { width: number; height: number } | null {
  if (b[0] === 0x89 && b[1] === 0x50) return { width: (b[16]! << 24) | (b[17]! << 16) | (b[18]! << 8) | b[19]!, height: (b[20]! << 24) | (b[21]! << 16) | (b[22]! << 8) | b[23]! };
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!, len = (b[i + 2]! << 8) | b[i + 3]!;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: (b[i + 5]! << 8) | b[i + 6]!, width: (b[i + 7]! << 8) | b[i + 8]! };
    i += 2 + len;
  }
  return null;
}

/**
 * A picture added to the .docx package: its relationship in word/_rels/document.xml.rels and its type in
 * [Content_Types].xml (once per extension). Returns both files as they should be written back.
 */
export function addImagePart(parts: { rels: string; types: string }, img: { relId: string; target: string; ext: "png" | "jpeg"; mime: string }): { rels: string; types: string } {
  const rel = `<Relationship Id="${img.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${img.target}"/>`;
  const rels = parts.rels.includes(`Id="${img.relId}"`) ? parts.rels : parts.rels.replace("</Relationships>", `${rel}</Relationships>`);
  const types = new RegExp(`Extension="${img.ext}"`, "i").test(parts.types) ? parts.types : parts.types.replace(/(<Types[^>]*>)/, `$1<Default Extension="${img.ext}" ContentType="${img.mime}"/>`);
  return { rels, types };
}

/** An inline picture run, `widthCm` wide and as tall as its proportions make it. */
export function imageRun(relId: string, n: number, size: { width: number; height: number }, widthCm: number): string {
  const EMU_PER_CM = 360000, cx = Math.round(widthCm * EMU_PER_CM), cy = Math.round(cx * (size.height / Math.max(1, size.width)));
  return `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${9000 + n}" name="mark${n}"/>`
    + `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
    + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${9000 + n}" name="mark${n}"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${relId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

/** Who issues documents from a template: the roles and the people the manager picked; nobody listed = everyone. */
export function seesTemplate(t: { seeRoles: readonly string[]; seeUserIds: readonly string[] }, me: { id: string; roles: readonly string[] }): boolean {
  if (!t.seeRoles.length && !t.seeUserIds.length) return true;
  return t.seeUserIds.includes(me.id) || me.roles.some((r) => t.seeRoles.includes(r));
}

/** Who sets the templates up (client, 25 Nov: «أنا اللي أحط التمبلت»): the Super Admin and the Office Manager. */
export const managesTemplates = (roles: readonly string[]): boolean => roles.includes("admin") || roles.includes("officemgr");

/** «بلّغ بس» issues it at once and tells the people listed; «لازم موافقة» waits for one of the approvers. */
export const TEMPLATE_MODES = ["notify", "approve"] as const;
export type TemplateMode = (typeof TEMPLATE_MODES)[number];
