"use client";
import { durationText } from "@places/domain";
import { Icon, Modal, Note, useAction } from "@/components/ui";
import { useAddComment } from "./use-lead";
import { useLeadSummary } from "./use-leads";

/**
 * Demo askWa (1.18, M-01 Q5): right after No Answer, «بعتله واتساب؟»; the answer goes on the lead as a comment.
 * The note says how long the lead stays and how often the Alarm comes, from «قواعد الليدز».
 */
export function WhatsAppQuestion({ lead, onClose }: { lead: { id: string; name: string }; onClose: () => void }) {
  const run = useAction();
  const add = useAddComment();
  const rules = useLeadSummary("client").data?.noAnswerRules;
  const answer = (sent: boolean) => run(async () => {
    await add(lead.id, sent ? "No Answer · بعتله واتساب" : "No Answer · مابعتلوش واتساب");
    onClose();
  }, "اتسجّلت كومنت على الليد");
  return (
    <Modal title={`No Answer · ${lead.name}`} onClose={onClose}>
      {rules && <Note>الليد هيفضل عندك {durationText(rules.hours * 60)}، وهيجيلك Alarm كل {rules.remindH} ساعات تكلّمه. بعدها بيروح للسيلز اللي عليه الدور.</Note>}
      <p>بعتله واتساب؟</p>
      <div className="row end">
        <button className="btn ghost" onClick={() => void answer(false)}>لأ</button>
        <button className="btn" onClick={() => void answer(true)}><Icon name="send" />اه بعتله</button>
      </div>
    </Modal>
  );
}
