import type { ReactNode } from "react";
import type { useFields } from "@/lib/me";

/** M-09 field permissions on a form (as the units' form): a hidden field has no input; a read-only one is shown locked. */
export const only = (fields: ReturnType<typeof useFields>, key: string, node: ReactNode): ReactNode =>
  !fields.shows(key) ? null : fields.edits(key) ? node : <fieldset key={key} className="field-lock" disabled>{node}</fieldset>;
