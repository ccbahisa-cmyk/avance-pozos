// Avance de pozos — versión instalable (funciona sin señal).
// La página queda guardada en el teléfono (service worker) y los cambios
// se suben a la planilla de Google cuando hay señal.

const API = "https://script.google.com/macros/s/AKfycbyUYWhx3PsfrZflb_TY_UQxDqwcmAHzBFw_33u7IL6IUnvYrJyKFBrD-zhy2b8oFuC_/exec";

const LS_CACHE = "avance-pozos-web-cache", LS_PEND = "avance-pozos-web-pend", LS_NAME = "avance-pozos-web-nombre";
const $ = id => document.getElementById(id);
const CHECK = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10.5l4 4 8-9" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

// --- comunicación con la planilla ---
async function apiGet() {
  const r = await fetch(API + "?api=datos&t=" + Date.now(), { cache: "no-store" });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Error de la planilla");
  return j;
}
async function apiPost(body) {
  // text/plain evita el pedido previo (CORS) que Apps Script no responde
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) { const e = new Error(j.error || "Error de la planilla"); e.server = true; throw e; }
  return j;
}

// --- estado ---
let TAREAS = [], pozos = new Map();      // n -> {n, t:[bool], notas, ultima}
let pend = lsGet(LS_PEND, {});           // "n|tarea" -> {pozo, tarea, hecho, quien, cuando}
let nombre = lsGet(LS_NAME, "");
let filtro = "all", q = "", openPozo = null, lastUndo = null, toastT = null, enviando = false, online = navigator.onLine;

function idx(k) { return TAREAS.findIndex(t => t[0] === k); }
function hecho(n, i) { const k = TAREAS[i][0], p = pend[n + "|" + k]; if (p) return p.hecho; const z = pozos.get(n); return !!(z && z.t[i]); }
function cuenta(n) { let c = 0; for (let i = 0; i < TAREAS.length; i++) if (hecho(n, i)) c++; return c; }
function esDes(k) { return k.indexOf("des_") === 0; }
function guardarCache() { lsSet(LS_CACHE, { tareas: TAREAS, pozos: [...pozos.values()] }); }

function aplicarDatos(d) {
  TAREAS = d.tareas; pozos = new Map(d.pozos.map(p => [p.n, p]));
  guardarCache(); render();
}

function render() {
  if (!TAREAS.length) return;
  const nums = [...pozos.keys()].sort((a, b) => a - b), T = TAREAS.length;
  const nDes = TAREAS.filter(t => esDes(t[0])).length;
  const desOk = nums.filter(n => TAREAS.every((t, i) => !esDes(t[0]) || hecho(n, i))).length;
  $("group").innerHTML = `<th class="pozo"></th><th class="grp" colspan="${nDes}">Desarrollo <span>${desOk}/${nums.length}</span></th><th colspan="${T - nDes}"></th>`;
  $("head").innerHTML = '<th class="pozo">Pozo</th>' + TAREAS.map(([k, l], i) => {
    const c = nums.filter(n => hecho(n, i)).length;
    return `<th class="task${esDes(k) ? " des" : ""}"><span class="lbl">${l.replace("Desarrollo · ", "")}</span><span class="cnt">${c}/${nums.length}</span></th>`;
  }).join("");
  let tot = 0; nums.forEach(n => tot += cuenta(n)); const max = nums.length * T;
  $("total").innerHTML = `<b>${max ? Math.round(tot * 100 / max) : 0}%</b><span>${tot} de ${max} tareas hechas</span>`;
  const vis = nums.filter(n => (filtro === "all" || cuenta(n) < T) && (!q || String(n).includes(q)));
  if (!vis.length) { $("body").innerHTML = `<tr><td class="empty" colspan="16">${nums.length ? "Ningún pozo coincide con el filtro." : "Todavía no hay pozos cargados."}</td></tr>`; return; }
  $("body").innerHTML = vis.map(n => {
    const c = cuenta(n), full = c === T;
    return `<tr class="${full ? "full" : ""}"><th class="pozo"><button class="pbtn" data-p="${n}" aria-label="Pozo ${n}, ${c} de ${T}">
      <span class="n">${n}</span><span class="p">${c}/${T}${full ? " · completo" : ""}</span><span class="bar"><i style="width:${c * 100 / T}%"></i></span></button></th>` +
      TAREAS.map(([k, l], i) => `<td class="c${esDes(k) ? " des" : ""}"><button class="cell${pend[n + "|" + k] ? " pend" : ""}" data-p="${n}" data-i="${i}" aria-pressed="${hecho(n, i)}" aria-label="Pozo ${n}, ${l}">${CHECK}</button></td>`).join("") + "</tr>";
  }).join("");
  if (openPozo != null) renderSheet();
}

function estadoSync() {
  const n = Object.keys(pend).length;
  $("sync").hidden = !n;
  $("syncMsg").textContent = n === 1 ? "1 cambio guardado en este teléfono, falta subirlo." : n + " cambios guardados en este teléfono, falta subirlos.";
  $("off").hidden = online;
}

async function subir() {
  if (enviando) return;
  const lista = Object.values(pend);
  if (!lista.length) { estadoSync(); return; }
  enviando = true;
  try {
    await apiPost({ accion: "cambios", cambios: lista });
    online = true;
    lista.forEach(c => {
      const id = c.pozo + "|" + c.tarea;
      if (pend[id] && pend[id].cuando === c.cuando) {
        const z = pozos.get(c.pozo), i = idx(c.tarea);
        if (z && i >= 0) z.t[i] = c.hecho;
        delete pend[id];
      }
    });
    lsSet(LS_PEND, pend); guardarCache();
  } catch (e) {
    online = navigator.onLine && !!e.server;
    if (e.server) showToast("La planilla rechazó un cambio: " + e.message, null);
  } finally {
    enviando = false; render(); estadoSync();
  }
  if (Object.keys(pend).length && online) setTimeout(subir, 3000);
}

function setCelda(n, i, val) {
  const k = TAREAS[i][0];
  pend[n + "|" + k] = { pozo: n, tarea: k, hecho: val, quien: nombre, cuando: new Date().toISOString() };
  lsSet(LS_PEND, pend); render(); estadoSync(); subir();
}

async function recargar() {
  if (Object.keys(pend).length || enviando) return;
  try { const d = await apiGet(); online = true; aplicarDatos(d); }
  catch (e) { online = false; }
  estadoSync();
}

// --- interfaz ---
function showToast(msg, undo) {
  $("toastMsg").textContent = msg; $("undo").hidden = !undo; lastUndo = undo; $("toast").hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { $("toast").hidden = true; lastUndo = null; }, 4500);
}
$("undo").onclick = () => { if (lastUndo) lastUndo(); $("toast").hidden = true; lastUndo = null; };

document.addEventListener("click", e => {
  const cell = e.target.closest(".cell");
  if (cell) {
    if (!nombre) { $("nameForm").hidden = false; $("nameIn").focus(); return; }
    const n = +cell.dataset.p, i = +cell.dataset.i, was = hecho(n, i);
    setCelda(n, i, !was);
    showToast(`Pozo ${n} · ${TAREAS[i][1]}: ${was ? "pendiente" : "hecho"}`, () => setCelda(n, i, was));
    return;
  }
  const pb = e.target.closest(".pbtn"); if (pb) openSheet(+pb.dataset.p);
});

$("fAll").onclick = () => { filtro = "all"; $("fAll").setAttribute("aria-pressed", "true"); $("fPend").setAttribute("aria-pressed", "false"); render(); };
$("fPend").onclick = () => { filtro = "pend"; $("fPend").setAttribute("aria-pressed", "true"); $("fAll").setAttribute("aria-pressed", "false"); render(); };
$("q").addEventListener("input", e => { q = e.target.value.trim(); render(); });

function mostrarNombre() {
  $("who").hidden = !nombre; $("nameForm").hidden = !!nombre;
  $("who").innerHTML = nombre ? `Marcando como <b></b> · <button type="button" id="cambiar">cambiar</button>` : "";
  if (nombre) { $("who").querySelector("b").textContent = nombre; $("cambiar").onclick = () => { $("nameIn").value = nombre; $("nameForm").hidden = false; $("nameIn").focus(); }; }
}
$("nameForm").addEventListener("submit", e => { e.preventDefault(); const v = $("nameIn").value.trim(); if (!v) return; nombre = v; lsSet(LS_NAME, v); mostrarNombre(); });

$("addForm").addEventListener("submit", async e => {
  e.preventDefault(); const n = parseInt($("newNum").value, 10);
  if (!n || n < 1) { showToast("Escribí un número de pozo válido.", null); return; }
  if (pozos.has(n)) { showToast(`El pozo ${n} ya está en la lista.`, null); return; }
  try { await apiPost({ accion: "pozo", pozo: n }); $("newNum").value = ""; showToast(`Pozo ${n} agregado.`, null); recargar(); }
  catch (err) { showToast(err.server ? err.message : "Para agregar un pozo hace falta señal.", null); }
});

function openSheet(n) {
  openPozo = n; const z = pozos.get(n); $("shNotes").value = z ? z.notas : ""; $("shSaved").textContent = "";
  renderSheet(); $("sheetbg").hidden = false; $("shClose").focus();
}
function renderSheet() {
  const n = openPozo, z = pozos.get(n); if (!z) { closeSheet(); return; }
  $("shTitle").textContent = `Pozo ${n} · ${cuenta(n)}/${TAREAS.length}`;
  $("shUltima").textContent = z.ultima ? "Último cambio: " + z.ultima : "";
  $("shList").innerHTML = TAREAS.map(([k, l], i) => {
    const d = hecho(n, i);
    return `<li><span class="dot ${d ? "d" : ""}"></span><span>${l}</span><span class="sub" style="margin:0 0 0 auto">${pend[n + "|" + k] ? "falta subir" : d ? "Hecho" : "Pendiente"}</span></li>`;
  }).join("");
}
function closeSheet() { openPozo = null; $("sheetbg").hidden = true; }
$("shClose").onclick = closeSheet;
$("sheetbg").addEventListener("click", e => { if (e.target.id === "sheetbg") closeSheet(); });
$("shSave").onclick = async () => {
  const n = openPozo, t = $("shNotes").value;
  try { await apiPost({ accion: "nota", pozo: n, texto: t, quien: nombre }); const z = pozos.get(n); if (z) z.notas = t; guardarCache(); $("shSaved").textContent = "Observación guardada."; }
  catch (err) { $("shSaved").textContent = err.server ? err.message : "No se guardó: hace falta señal."; }
};

// --- arranque: primero lo guardado en el teléfono, después la planilla ---
const cache = lsGet(LS_CACHE, null);
if (cache && cache.tareas) { TAREAS = cache.tareas; pozos = new Map(cache.pozos.map(p => [p.n, p])); render(); }
mostrarNombre(); estadoSync();
(async () => {
  if (Object.keys(pend).length) await subir();
  try { const d = await apiGet(); online = true; if (!Object.keys(pend).length) aplicarDatos(d); }
  catch (e) {
    online = false;
    if (!cache) $("body").innerHTML = '<tr><td class="empty" colspan="16">Sin señal. Abrí la app una vez con señal para que quede guardada en el teléfono.</td></tr>';
  }
  estadoSync();
})();
window.addEventListener("online", () => { online = true; subir(); recargar(); });
window.addEventListener("offline", () => { online = false; estadoSync(); });
setInterval(() => { if (Object.keys(pend).length) subir(); else recargar(); }, 30000);

// --- instalar la app en el teléfono ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
let promptInstalar = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); promptInstalar = e; $("instalar").hidden = false; });
$("instalar").onclick = async () => { if (!promptInstalar) return; promptInstalar.prompt(); await promptInstalar.userChoice; promptInstalar = null; $("instalar").hidden = true; };
