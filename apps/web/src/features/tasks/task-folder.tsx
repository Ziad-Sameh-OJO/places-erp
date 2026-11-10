"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { TaskRow, UnitPhotoView } from "@places/contracts";
import { MAX_UNIT_PHOTOS } from "@places/domain";
import { Chip, Icon, Modal, Note, useAction } from "@/components/ui";
import { api } from "@/lib/api";
import { FolderUpload } from "../inventory/unit-photos";

/**
 * 4.12 · the Retouch card's link to the unit's Pic & Info folder (demo tasks.js `card`: the task's photos link). The
 * designer opens or downloads the photos (or the ZIP) and adds the edited ones while working it; Manar orders and
 * removes on the unit's page. The API decides (`can.folder`); the buttons follow.
 */
export function TaskFolder({ task }: { task: TaskRow & { unit: NonNullable<TaskRow["unit"]> } }) {
  const t = useTranslations("inventory.photos");
  const [open, setOpen] = useState(false);
  return <span onClick={(e) => e.stopPropagation()}>
    <button className="lnk" onClick={() => setOpen(true)}><Icon name="image" />{t("folderButton")}</button>
    {open && <Modal title={t("modalTitle", { code: task.unit.code })} onClose={() => setOpen(false)}><Folder task={task} /></Modal>}
  </span>;
}

function Folder({ task }: { task: TaskRow & { unit: NonNullable<TaskRow["unit"]> } }) {
  const t = useTranslations("inventory.photos");
  const tr = useTranslations("tasks");
  const qc = useQueryClient();
  const run = useAction();
  const base = `/tasks/${task.id}/photos`;
  const photos = useQuery({ queryKey: ["task-photos", task.id], queryFn: () => api.get<UnitPhotoView[]>(base) }).data ?? [];
  const up = task.can.folder.upload;
  const added = (ids: string[]) => run(async () => {
    await api.post(base, { fileIds: ids });
    await qc.invalidateQueries({ queryKey: ["task-photos", task.id] });
  }, t("uploaded", { count: ids.length, code: task.unit.code }));
  return <>
    {up && <Note>{tr("roleNotes.designer")}</Note>}
    <div className="row">
      <span className="hint">{task.unit.code} · {t("files", { count: photos.length })}</span><span className="spacer" />
      {!!photos.length && <a className="btn ghost" href={`/api/v1${base}/zip`} download><Icon name="download" />{t("zip")}</a>}
      {up && <FolderUpload left={MAX_UNIT_PHOTOS - photos.length} onDone={added} />}
    </div>
    {photos.length ? (
      <div className="ufolder">
        {photos.map((p) => (
          <figure className="uf" key={p.id}>
            <a href={p.url} target="_blank" rel="noopener noreferrer" title={t("open")}>{p.pdf ? <span className="uf-doc"><Icon name="file" />PDF</span> : <img src={p.url} alt={p.name} loading="lazy" />}</a>
            {p.main && <Chip tone="ok">{t("main")}</Chip>}
            <figcaption>
              <span>{p.name}</span>
              {p.by && <small>{p.by}</small>}
              <a className="uf-dl" href={p.download} download={p.name}><Icon name="download" />{t("download")}</a>
            </figcaption>
          </figure>
        ))}
      </div>
    ) : (
      <div className="ufolder empty"><Icon name="folder" /><b>{t("empty")}</b><span className="hint">{t("emptyView")}</span></div>
    )}
  </>;
}
