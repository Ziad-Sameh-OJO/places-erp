/** The demo's «اطبع»: only the given block goes to paper (app.css `body.printing #printArea`). */
export function printBlock(el: HTMLElement | null) {
  if (!el) return;
  const area = document.createElement("div");
  area.id = "printArea";
  area.innerHTML = el.innerHTML;
  document.body.append(area);
  document.body.classList.add("printing");
  const done = () => { area.remove(); document.body.classList.remove("printing"); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.print();
}
