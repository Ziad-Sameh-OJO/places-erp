"use client";
import { useTranslations } from "next-intl";
import { Icon, Modal, Note, useAction } from "@/components/ui";
import { useAddComment } from "./use-lead";
import { useDuration } from "./lead-bits";
import { useLeadSummary } from "./use-leads";

/**
 * Demo askWa (1.18, M-01 Q5): right after No Answer, «بعتله واتساب؟»; the answer goes on the lead as a comment.
 * The note says how long the lead stays and how often the Alarm comes, from «قواعد الليدز».
 */
export function WhatsAppQuestion({ lead, onClose }: { lead: { id: string; name: string }; onClose: () => void }) {
  const t = useTranslations("leads.whatsapp");
  const duration = useDuration();
  const run = useAction();
  const add = useAddComment();
  const rules = useLeadSummary("client").data?.noAnswerRules;
  const answer = (sent: boolean) => run(async () => {
    // the comment is stored on the lead in the API's language (Arabic), like every other recorded text
    await add(lead.id, sent ? "No Answer · بعتله واتساب" : "No Answer · مابعتلوش واتساب");
    onClose();
  }, t("saved"));
  return (
    <Modal title={`No Answer · ${lead.name}`} onClose={onClose}>
      {rules && <Note>{t("note", { stay: duration(rules.hours * 60), every: rules.remindH })}</Note>}
      <p>{t("question")}</p>
      <div className="row end">
        <button className="btn ghost" onClick={() => void answer(false)}>{t("no")}</button>
        <button className="btn" onClick={() => void answer(true)}><Icon name="send" />{t("yes")}</button>
      </div>
    </Modal>
  );
}
