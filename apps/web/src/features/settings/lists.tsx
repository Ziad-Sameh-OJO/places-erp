"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LIST_GROUPS, LOCKED_VALUES, type ListEditors, type ListItem, type ListKey, type Settings } from "@places/contracts";
import { UNIT_TYPES, canChangeList, defaultListEditors, type ListAction, type ListEditorsOf } from "@places/domain";
import { Card, Chip, Icon, Note, onFormSubmit, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { useTranslations } from "next-intl";
import { serverText } from "@/lib/server-text";

interface EditorOptions { roles: { key: string; label: string }[]; people: { id: string; name: string }[]; masterEdit: string[] }

/**
 * «الإعدادات ← القوايم» (12.7, demo admin.js): every dropdown list, grouped like the demo. Adding shows at once in the
 * forms; ✕ switches a value off («موقوف»): gone from new records, kept on old ones and in filters (M-13 2.1 · 3.3).
 * Switched-off values are listed under each list with «رجّع» (the requirements' «موقوف» state; the demo only removes).
 */
export function ListsTab({ settings }: { settings: Settings }) {
  const t = useTranslations("settings.lists");
  const { me, can, canSet } = useMe();
  // who may add / switch off in each list (#186), its department until it's set up (M-13 4.1); the API checks the same rule
  const may = (key: ListKey, a: ListAction) => !!me && canChangeList(settings.listEditors[key], a, { id: me.id, roles: me.roles, masterEdit: canSet(key) });
  return (
    <>
      <Note>{t("note")}</Note>
      {LIST_GROUPS.map((g) => (
        <section key={g.title}>
          <h3 className="mini-h">{serverText(g.title)}</h3>
          <div className="cols">
            {/* the unit's type stays fixed in the code (each type has its own columns, 2.1): shown, locked */}
            {g.lists.some(([k]) => k === "finishings") && (
              <Card title={t("unitTypes.title")} icon="list" sub={t("unitTypes.sub")} extra={<Chip plain>{UNIT_TYPES.length}</Chip>}>
                <div className="chips-edit">{UNIT_TYPES.map((u) => <span className="chip-e" key={u}>{u} <Icon name="lock" /></span>)}</div>
              </Card>
            )}
            {/* the receive sources are accounts of the chart, not a list (accountant's chart, 4 Nov · 9.1) */}
            {g.lists.some(([k]) => k === "vendors") && (
              <Card title={t("sources.title")} icon="list" sub={t("sources.sub")}>
                <Note>{t("sources.note")}</Note>
              </Card>
            )}
            {g.lists.map(([key, label]) => <ListCard key={key} listKey={key} label={serverText(label)} items={settings[key]} canAdd={may(key, "add")} canOff={may(key, "off")}
              editors={can("access", "edit") ? settings.listEditors : undefined} {...(key === "channels" ? { channelTypes: settings.channelTypes } : {})} />)}
          </div>
        </section>
      ))}
    </>
  );
}

function ListCard({ listKey, label, items, canAdd, canOff, editors, channelTypes }: {
  listKey: ListKey; label: string; items: ListItem[]; canAdd: boolean; canOff: boolean; editors: ListEditors | undefined;
  channelTypes?: Settings["channelTypes"]; // the channels card only: each channel opens its «نوع الـ Channel» list (22 Nov)
}) {
  const t = useTranslations("settings.lists.card");
  const qc = useQueryClient();
  const run = useAction();
  const [showOff, setShowOff] = useState(false);
  const [showWho, setShowWho] = useState(false);
  const [openChannel, setOpenChannel] = useState<string | null>(null);
  const locked = new Set(LOCKED_VALUES[listKey] ?? []);
  const active = items.filter((i) => i.active), off = items.filter((i) => !i.active);
  const save = (next: ListItem[], ok: string) => run(async () => {
    // refused or not, reload: a save refused because someone else changed the list meanwhile works on the next try
    try { await api.put(`/settings/${listKey}`, { value: next }); } finally { await qc.invalidateQueries({ queryKey: ["settings"] }); }
  }, ok);
  const toggle = (value: string, on: boolean) =>
    save(items.map((i) => (i.value === value ? { ...i, active: on } : i)), on ? t("back", { value }) : t("off", { value }));
  const add = (form: HTMLFormElement, raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const had = items.find((i) => i.value === value);
    if (had?.active) { void run(async () => { throw new Error(t("exists")); }); return; }
    if (had && !canOff) { void run(async () => { throw new Error(t("offByOther", { value })); }); return; }
    // a switched-off value typed again comes back instead of being added twice
    void save(had ? items.map((i) => (i.value === value ? { ...i, active: true } : i)) : [...items, { value, active: true }], had ? t("back", { value }) : t("added"))
      .then(() => form.reset());
  };
  return (
    <Card title={label} icon="list" extra={<>
      {editors && <button type="button" className="btn ghost sm" aria-expanded={showWho} onClick={() => setShowWho(!showWho)}><Icon name="users" />{t("whoEdits")}</button>}
      <Chip plain>{active.length}</Chip>
    </>}>
      {editors && showWho && <WhoEdits listKey={listKey} editors={editors} />}
      <div className="chips-edit">
        {active.map((i) => (
          <span className={`chip-e${openChannel === i.value ? " on" : ""}`} key={i.value}>
            {channelTypes
              ? <button type="button" className="chip-open" aria-expanded={openChannel === i.value} onClick={() => setOpenChannel(openChannel === i.value ? null : i.value)}>
                {serverText(i.value)}{!!channelTypes[i.value]?.filter((x) => x.active).length && <small className="num">{channelTypes[i.value]!.filter((x) => x.active).length}</small>}
              </button>
              : serverText(i.value)}
            {locked.has(i.value) ? <span title={t("locked")}><Icon name="lock" /></span>
              : canOff && <button aria-label={t("switchOff", { value: serverText(i.value) })} onClick={() => void toggle(i.value, false)}><Icon name="x" /></button>}
          </span>
        ))}
        {!active.length && <span className="hint">{t("empty")}</span>}
      </div>
      {channelTypes && active.length > 0 && !openChannel && <p className="hint">{t("channelTypesHint")}</p>}
      {channelTypes && openChannel && <ChannelTypesEditor channel={openChannel} all={channelTypes} canAdd={canAdd} canOff={canOff} onClose={() => setOpenChannel(null)} />}
      {canAdd && (
        <form className="row" onSubmit={onFormSubmit((d) => add(document.getElementById(`ls-${listKey}`) as HTMLFormElement, String(d.get("v") ?? "")))} id={`ls-${listKey}`}>
          <input name="v" placeholder={t("addPlaceholder")} required maxLength={80} aria-label={t("addTo", { label })} /><button className="btn ghost sm"><Icon name="plus" />{t("add")}</button>
        </form>
      )}
      {off.length > 0 && (
        <div className="off-list">
          <button type="button" className="link hint" onClick={() => setShowOff(!showOff)} aria-expanded={showOff}>{t("offList", { count: off.length })}</button>
          {showOff && (
            <div className="chips-edit">
              {off.map((i) => (
                <span className="chip-e" key={i.value} style={{ opacity: 0.65 }}>{serverText(i.value)}
                  {canOff && <button className="btn ghost sm" style={{ padding: "0 6px" }} onClick={() => void toggle(i.value, true)}>{t("restore")}</button>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * «مين يعدّل» (#186, for whoever has «access: edit»): the roles / people who add to this list and the ones who switch
 * its values off or back on. A list not set up yet starts from its department and the Super Admin (M-13 4.1), or
 * the roles with «master: edit» for a list no department owns.
 */
function WhoEdits({ listKey, editors }: { listKey: ListKey; editors: ListEditors }) {
  const t = useTranslations("settings.lists.who");
  const qc = useQueryClient();
  const run = useAction();
  const o = useQuery({ queryKey: ["list-editors-options"], queryFn: () => api.get<EditorOptions>("/settings/list-editors/options"), staleTime: 60_000 }).data;
  if (!o) return <p className="hint">{t("loading")}</p>;
  const start = defaultListEditors(listKey, o.masterEdit);
  const rule: ListEditorsOf = editors[listKey] ?? { add: start, off: start };
  const role = (x: string) => o.roles.find((r) => r.key === x)?.label;
  const name = (x: string) => { const r = role(x); return r ? serverText(r) : o.people.find((p) => p.id === x)?.name ?? x; };
  const save = (a: ListAction, to: string[]) => run(async () => {
    await api.put("/settings/listEditors", { value: { ...editors, [listKey]: { ...rule, [a]: to } } });
    await qc.invalidateQueries({ queryKey: ["settings"] });
  }, t("saved"));
  const row = (a: ListAction, label: string) => (
    <div className="field">
      <span>{label}</span>
      <div className="row">
        {rule[a].map((x) => <button key={x} type="button" className="btn ghost sm" aria-label={t("remove", { name: name(x) })} onClick={() => void save(a, rule[a].filter((y) => y !== x))}>{name(x)} <Icon name="x" /></button>)}
        {!rule[a].length && <span className="hint">{t("nobody")}</span>}
        <select value="" aria-label={t("addTo", { label })} style={{ maxWidth: 200 }} onChange={(e) => e.target.value && void save(a, [...rule[a], e.target.value])}>
          <option value="">{t("addPrompt")}</option>
          <optgroup label={t("roles")}>{o.roles.filter((r) => !rule[a].includes(r.key)).map((r) => <option key={r.key} value={r.key}>{serverText(r.label)}</option>)}</optgroup>
          <optgroup label={t("people")}>{o.people.filter((p) => !rule[a].includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
        </select>
      </div>
    </div>
  );
  return (
    <div style={{ marginBottom: 12 }}>
      {!editors[listKey] && <Note>{t("notSetUp")}</Note>}
      {row("add", t("adds"))}
      {row("off", t("offs"))}
    </div>
  );
}

/**
 * «نوع الـ Channel» (client, 22 Nov): the list under one channel — Instagram → Reel, Story, Post… — typed here and
 * offered on a lead of that channel. Same rules as the lists: ✕ switches a type off (old leads keep it), «رجّع» brings
 * it back; who edits the channels edits these (the API checks it).
 */
function ChannelTypesEditor({ channel, all, canAdd, canOff, onClose }: { channel: string; all: Settings["channelTypes"]; canAdd: boolean; canOff: boolean; onClose: () => void }) {
  const t = useTranslations("settings.lists.channelTypes");
  const qc = useQueryClient();
  const run = useAction();
  const items = all[channel] ?? [];
  const active = items.filter((i) => i.active), off = items.filter((i) => !i.active);
  const save = (next: ListItem[], ok: string) => run(async () => {
    try { await api.put("/settings/channelTypes", { value: { ...all, [channel]: next } }); } finally { await qc.invalidateQueries({ queryKey: ["settings"] }); }
  }, ok);
  const toggle = (value: string, on: boolean) => save(items.map((i) => (i.value === value ? { ...i, active: on } : i)), on ? t("back", { value }) : t("off", { value }));
  const add = (form: HTMLFormElement, raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const had = items.find((i) => i.value === value);
    if (had?.active) { void run(async () => { throw new Error(t("exists")); }); return; }
    void save(had ? items.map((i) => (i.value === value ? { ...i, active: true } : i)) : [...items, { value, active: true }], had ? t("back", { value }) : t("added", { value }))
      .then(() => form.reset());
  };
  return (
    <div className="channel-types">
      <div className="row"><b className="spacer">{t("title", { channel: serverText(channel) })}</b><button type="button" className="icon-btn" aria-label={t("close")} onClick={onClose}><Icon name="x" /></button></div>
      <div className="chips-edit">
        {active.map((i) => (
          <span className="chip-e" key={i.value}>{i.value}
            {canOff && <button aria-label={t("switchOff", { value: i.value })} onClick={() => void toggle(i.value, false)}><Icon name="x" /></button>}
          </span>
        ))}
        {!active.length && <span className="hint">{t("empty")}</span>}
        {off.map((i) => (
          <span className="chip-e" key={i.value} style={{ opacity: 0.65 }}>{i.value}
            {canOff && <button className="btn ghost sm" style={{ padding: "0 6px" }} onClick={() => void toggle(i.value, true)}>{t("restore")}</button>}
          </span>
        ))}
      </div>
      {canAdd && (
        <form className="row" id={`ct-${channel}`} onSubmit={onFormSubmit((d) => add(document.getElementById(`ct-${channel}`) as HTMLFormElement, String(d.get("v") ?? "")))}>
          <input name="v" placeholder={t("placeholder")} required maxLength={80} aria-label={t("addTo", { channel: serverText(channel) })} autoFocus />
          <button className="btn ghost sm"><Icon name="plus" />{t("add")}</button>
        </form>
      )}
    </div>
  );
}
