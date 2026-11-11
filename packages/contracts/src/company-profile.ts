import { z } from "zod";
import { Id } from "./common.ts";

/** M-04 · the Company Profile file marketing uploads (a PDF of their own finished uploads). */
export const CompanyProfileBaseInput = z.object({ fileId: Id });
export type CompanyProfileBaseInput = z.infer<typeof CompanyProfileBaseInput>;

/** Q26 · a Done Deal's logo (an image of their own finished uploads) for «عملاؤنا». */
export const DealLogoInput = z.object({ fileId: Id });
export type DealLogoInput = z.infer<typeof DealLogoInput>;

/** A built Company Profile: who pressed «Update» and when, and its links (null when storage can't sign them). */
export interface CompanyProfileVersionView {
  id: string;
  at: string;
  by: string;
  logos: number;
  url: string | null;
  download: string | null;
}

/** Everyone: the newest Company Profile (null until marketing's first «Update»). */
export interface CompanyProfileLatest { latest: CompanyProfileVersionView | null }

/** A Done Deal's logo, keyed by the deal on the «الصفقات» tab. */
export interface DealLogoView { url: string | null; done: boolean; published: boolean }

/** Marketing's card: the file, the versions (newest first), each deal's logo and what «Update» would change. */
export interface CompanyProfileAdmin {
  base: { id: string; name: string; at: string } | null;
  versions: CompanyProfileVersionView[];
  logos: Record<string, DealLogoView>;
  changes: { added: number; removed: number; newBase: boolean; any: boolean };
}
