import { Controller, Get, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { Requires } from "../authz/requires.decorator";
import { Me, type CurrentUser } from "../auth/current-user.decorator";
import { DocumentsService, esc, layout } from "./documents.service";

// only the number is left-to-right: «ج.م» inside an LTR run would come out as «م.ج»
const egp = (n: number) => `<span class="num">${n.toLocaleString("en-US")}</span> ج.م`;

/** A sample with what real PDFs need: Arabic paragraphs, a table, money and dates. The client's own split (M-05). */
function sample() {
  const rows: [string, number][] = [["دفعة أولى", 25_000], ["دفعة تانية", 25_000], ["الباقي عند التسليم", 50_000]];
  return layout("مستند تجريبي", `
    <h1>مستند تجريبي · Places ERP</h1>
    <p>الصفحة دي بتتأكد إن الحروف العربي مترابطة صح، والاتجاه من اليمين للشمال، والأرقام زي ${esc("U-101")} و<span class="num">01012345678</span> ظاهرة مظبوط.</p>
    <h2>تقسيم صفقة قيمتها ${egp(100_000)}</h2>
    <table><thead><tr><th>البند</th><th>المبلغ</th></tr></thead>
      <tbody>${rows.map(([what, n]) => `<tr><td>${esc(what)}</td><td>${egp(n)}</td></tr>`).join("")}</tbody></table>`);
}

/** Only the sample lives here; each module renders its own documents (TCR, unit PDF…) through DocumentsService. */
@Controller("documents")
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Get("sample") @Requires("master", "edit")
  async preview(@Res() res: Response) {
    const pdf = await this.docs.pdf(sample());
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent("مستند تجريبي.pdf")}`);
    res.end(pdf);
  }

  @Post("sample") @Requires("master", "edit")
  save(@Me() me: CurrentUser) { return this.docs.save(me, "مستند تجريبي.pdf", sample()); }
}
