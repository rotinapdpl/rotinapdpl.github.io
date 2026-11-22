/* Rotina PDPL — camada do aplicativo (login, Firebase, permissões, instalação).
   Carregado depois do código principal; troca o armazenamento do Claude pelo Firebase. */
(function () {
"use strict";
const APP_VERSION = "4.0";
const cfg = window.FIREBASE_CONFIG || {};
const iso = () => new Date().toISOString();
const ROLES = {pendente: "Aguardando aprovação", estagiario: "Estagiário", tecnico: "Técnico", admin: "Coordenação", bloqueado: "Bloqueado"};

/* ---------- estilos próprios do app ---------- */
const css = document.createElement("style");
css.textContent = `
#auth{position:fixed;inset:0;z-index:60;background:var(--navy);display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto}
#auth[hidden]{display:none!important}
.auth-box{background:var(--surface);color:var(--ink);border-radius:16px;padding:28px 26px;width:100%;max-width:400px;box-shadow:0 20px 60px rgba(0,0,0,.35)}
.auth-brand{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.auth-brand img{height:40px;background:var(--navy);border-radius:10px;padding:6px 7px}
.auth-brand b{font-size:20px;letter-spacing:.02em;display:block}.auth-brand span{font-size:12px;color:var(--muted);letter-spacing:.12em}
.auth-tabs{display:flex;gap:6px;margin-bottom:14px}.auth-tabs button{flex:1;height:38px;border-radius:9px;border:1px solid var(--line);background:var(--surface-2);color:var(--ink2);font:inherit;font-weight:600;cursor:pointer}
.auth-tabs button[aria-pressed="true"]{background:var(--navy);color:#fff;border-color:var(--navy)}
.auth-box label{display:block;font-size:13px;font-weight:600;margin:10px 0 4px}
.auth-box input{width:100%;height:42px;font-size:16px;border:1px solid var(--line);border-radius:9px;padding:0 12px;background:var(--surface);color:var(--ink)}
.auth-box .btn{width:100%;height:44px;margin-top:14px;justify-content:center}
.auth-or{text-align:center;color:var(--muted);font-size:12.5px;margin:14px 0 0}
.auth-err{color:#b3261e;font-size:13.5px;margin:10px 0 0;min-height:1em}
.auth-link{background:none;border:0;color:var(--ink2);text-decoration:underline;font:inherit;font-size:13px;cursor:pointer;margin-top:12px;padding:0}
.auth-msg{font-size:15px;line-height:1.5}
#modalPin label{display:none!important}
[data-act2="delPin"]{display:none!important}
.userbox{padding:10px 16px 4px;font-size:12.5px;color:var(--on-navy-2);display:flex;align-items:center;justify-content:space-between;gap:8px}
.userbox b{color:#fff;font-weight:600;display:block;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px}
.userbox button{background:none;border:1px solid var(--navy-line);color:#fff;border-radius:8px;height:28px;padding:0 10px;font:inherit;font-size:12px;cursor:pointer}
.badge{display:inline-block;min-width:18px;height:18px;border-radius:9px;background:#eb6834;color:#fff;font-size:11px;font-weight:700;line-height:18px;text-align:center;padding:0 5px;margin-left:6px}
.ro-banner{background:#fff4d6;color:#5c4400;border:1px solid #f0d58a;border-radius:10px;padding:8px 12px;font-size:13.5px;margin:0 0 14px}
body.ro .savebar,body.ro [data-act="delRec"],body.ro [data-act2="delFarm"],body.ro [data-act2="impJson"]{display:none!important}
.upd{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:70;background:var(--navy);color:#fff;border-radius:12px;padding:10px 12px 10px 16px;display:flex;gap:12px;align-items:center;box-shadow:0 8px 30px rgba(0,0,0,.3);font-size:14px}
.upd button{background:#1f9bb5;color:#fff;border:0;border-radius:8px;height:32px;padding:0 12px;font:inherit;font-weight:600;cursor:pointer}
.utbl select{height:34px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit}
.utbl tr.pend td{background:rgba(235,104,52,.08)}
`;
document.head.appendChild(css);

/* ---------- tela de login (sobre o app) ---------- */
const authEl = document.createElement("div"); authEl.id = "auth"; document.body.appendChild(authEl);
const logoSrc = () => (document.getElementById("logoImg") || {}).src || "";
const brand = () => `<div class="auth-brand"><img src="${logoSrc()}" alt=""><div><b>Rotina PDPL</b><span>GESTÃO À VISTA</span></div></div>`;
function authScreen(html) { authEl.innerHTML = `<div class="auth-box">${brand()}${html}</div>`; authEl.hidden = false; }
function hideAuth() { authEl.hidden = true; authEl.innerHTML = ""; }

if (!cfg.apiKey || /COLE/.test(cfg.apiKey)) {
  authScreen(`<p class="auth-msg">Falta configurar o Firebase. Abra o arquivo <b>firebase-config.js</b> e cole a configuração do seu projeto (veja o guia de instalação).</p>`);
  return;
}

firebase.initializeApp(cfg);
const auth = firebase.auth(), db = firebase.firestore();
db.enablePersistence({synchronizeTabs: true}).catch(() => {});
const FV = firebase.firestore.FieldValue;

let ME = null, pendingName = "", meUnsub = null, dataUnsubs = [], farmSubs = {}, usersUnsub = null;
S.pub = {}; S.users = [];
const seesAll = () => !!ME && (ME.role === "admin" || ME.role === "tecnico");
const isAdmin = () => !!ME && ME.role === "admin";
const canEdit = () => !!ME && (ME.role === "admin" || ME.role === "estagiario");

/* ---------- login ---------- */
let authTab = "entrar";
const AUTH_ERR = {"auth/invalid-credential": "E-mail ou senha incorretos.", "auth/wrong-password": "E-mail ou senha incorretos.", "auth/user-not-found": "E-mail ou senha incorretos.",
  "auth/email-already-in-use": "Já existe uma conta com este e-mail. Use Entrar.", "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.", "auth/invalid-email": "E-mail inválido.",
  "auth/too-many-requests": "Muitas tentativas. Espere alguns minutos.", "auth/network-request-failed": "Sem internet. Para entrar pela primeira vez é preciso estar conectado.",
  "auth/popup-closed-by-user": "", "auth/cancelled-popup-request": "", "auth/missing-password": "Digite a senha."};
const authErr = e => (e && e.code in AUTH_ERR) ? AUTH_ERR[e.code] : "Não foi possível entrar agora. Tente de novo.";
function showLogin(msg = "") {
  const novo = authTab === "criar";
  authScreen(`<div class="auth-tabs"><button data-atab2="entrar" aria-pressed="${!novo}">Entrar</button><button data-atab2="criar" aria-pressed="${novo}">Criar conta</button></div>
    <form id="authForm" autocomplete="on">
      ${novo ? `<label for="aNome">Seu nome</label><input id="aNome" autocomplete="name" required>` : ""}
      <label for="aEmail">E-mail</label><input id="aEmail" type="email" autocomplete="email" required>
      <label for="aSenha">Senha</label><input id="aSenha" type="password" autocomplete="${novo ? "new-password" : "current-password"}" required minlength="6">
      <button class="btn primary" type="submit">${novo ? "Criar conta" : "Entrar"}</button>
    </form>
    <p class="auth-or">ou</p><button class="btn" id="aGoogle" type="button">Entrar com Google</button>
    <p class="auth-err" id="aErr">${msg}</p>
    ${novo ? `<p class="note" style="margin:6px 0 0">Depois de criar a conta, a coordenação precisa liberar seu acesso.</p>` : `<button class="auth-link" id="aReset" type="button">Esqueci minha senha</button>`}`);
  authEl.querySelectorAll("[data-atab2]").forEach(b => b.onclick = () => { authTab = b.dataset.atab2; showLogin(); });
  const err = t => { const e = document.getElementById("aErr"); if (e) e.textContent = t; };
  document.getElementById("authForm").onsubmit = async ev => {
    ev.preventDefault(); err("");
    const email = document.getElementById("aEmail").value.trim(), senha = document.getElementById("aSenha").value;
    try {
      if (novo) { pendingName = document.getElementById("aNome").value.trim(); const r = await auth.createUserWithEmailAndPassword(email, senha); if (pendingName) await r.user.updateProfile({displayName: pendingName}); }
      else await auth.signInWithEmailAndPassword(email, senha);
    } catch (e) { err(authErr(e)); }
  };
  document.getElementById("aGoogle").onclick = async () => {
    err(""); const p = new firebase.auth.GoogleAuthProvider();
    try { await auth.signInWithPopup(p); } catch (e) { if (e && /popup-blocked|operation-not-supported/.test(e.code)) auth.signInWithRedirect(p); else err(authErr(e)); }
  };
  const rs = document.getElementById("aReset");
  if (rs) rs.onclick = async () => { const email = document.getElementById("aEmail").value.trim(); if (!email) { err("Digite seu e-mail acima e clique de novo."); return; }
    try { await auth.sendPasswordResetEmail(email); err("Enviamos um link para trocar a senha no seu e-mail."); } catch (e) { err(authErr(e)); } };
}
function showWaiting() {
  const blk = ME && ME.role === "bloqueado";
  authScreen(`<p class="auth-msg">${blk ? "Seu acesso ao Rotina PDPL está bloqueado. Fale com a coordenação do programa." : `Olá${ME && ME.nome ? ", " + esc(ME.nome.split(" ")[0]) : ""}! Sua conta foi criada.<br>Agora a coordenação precisa liberar seu acesso. Assim que for liberado, esta tela abre o app sozinha.`}</p>
    <button class="btn" id="aSair" type="button">Sair</button>`);
  document.getElementById("aSair").onclick = () => auth.signOut();
}

/* ---------- sessão ---------- */
auth.onAuthStateChanged(u => {
  stopData(); if (meUnsub) { meUnsub(); meUnsub = null; }
  if (!u) { ME = null; S.farmId = null; S.view = "painel"; showLogin(); return; }
  authScreen(`<p class="auth-msg">Entrando…</p>`);
  const ref = db.collection("users").doc(u.uid);
  meUnsub = ref.onSnapshot(async snap => {
    if (!snap.exists) {
      try { await ref.set({nome: pendingName || u.displayName || (u.email || "").split("@")[0], email: u.email || "", role: "pendente", farms: [], criadoEm: iso()}); }
      catch (e) { showLogin("Não foi possível criar seu cadastro. Tente de novo."); }
      return;
    }
    const d = snap.data(), prev = ME && ME.role;
    ME = Object.assign({uid: u.uid}, d, {farms: d.farms || []});
    if (!["admin", "tecnico", "estagiario"].includes(ME.role)) { stopData(); showWaiting(); return; }
    hideAuth(); paintUser();
    if (prev !== ME.role) { stopData(); startData(); } else if (!seesAll()) ME.farms.forEach(subFarm);
  }, () => showLogin("Não foi possível carregar sua conta."));
});

function stopData() {
  dataUnsubs.forEach(f => { try { f(); } catch (e) {} }); dataUnsubs = [];
  Object.values(farmSubs).forEach(x => x.u.forEach(f => { try { f(); } catch (e) {} })); farmSubs = {};
  if (usersUnsub) { usersUnsub(); usersUnsub = null; }
  S.farms = {}; S.recs = {}; S.anims = {}; S.acoes = {}; S.livro = []; S.pub = {}; S.users = []; S.loaded = false;
  try { calcCache.clear(); } catch (e) {}
}
let renderQ = false;
function upd(force) {
  try { calcCache.clear(); } catch (e) {}
  setStatus(navigator.onLine ? "cloud" : "local", navigator.onLine ? "Salvo na nuvem" : "Sem internet: salva quando voltar");
  refreshSide();
  if (renderQ) return; renderQ = true;
  requestAnimationFrame(() => { renderQ = false; if (force || (!isDirty() && !["novo", "sobre", "metas", "usuarios"].includes(S.view))) render(); });
}
const errH = () => { setStatus("local", "Erro ao carregar os dados"); };
function startData() {
  S.loaded = false; let parts = seesAll() ? 3 : 1;
  const part = () => { if (--parts === 0) { S.loaded = true; upd(true); } };
  let p1 = true;
  dataUnsubs.push(db.collection("farmsPub").onSnapshot(s => { const o = {}; s.forEach(d => o[d.id] = Object.assign({id: d.id}, d.data())); S.pub = o; if (p1) { p1 = false; part(); } else upd(); }, e => { errH(e); if (p1) { p1 = false; part(); } }));
  if (seesAll()) {
    let p2 = true, p3 = true;
    dataUnsubs.push(db.collection("farms").onSnapshot(s => { const o = {}; s.forEach(d => o[d.id] = d.data()); S.farms = o; if (p2) { p2 = false; part(); } else upd(); }, e => { errH(e); if (p2) { p2 = false; part(); } }));
    dataUnsubs.push(db.collectionGroup("data").onSnapshot(s => {
      const r = {}, a = {}, c = {};
      s.forEach(d => { const fid = d.ref.parent.parent.id, o = d.data(); if (d.id.startsWith("rec_")) r[recKey(fid, o.ym)] = o; else if (d.id === "anim") a[fid] = o.list || []; else if (d.id === "acoes") c[fid] = o.list || []; });
      S.recs = r; S.anims = a; S.acoes = c; if (p3) { p3 = false; part(); } else upd();
    }, e => { errH(e); if (p3) { p3 = false; part(); } }));
    dataUnsubs.push(db.collection("program").doc("livro").onSnapshot(d => { S.livro = (d.exists && d.data().list) || []; upd(); }, () => {}));
    if (isAdmin()) usersUnsub = db.collection("users").onSnapshot(s => { S.users = s.docs.map(d => Object.assign({uid: d.id}, d.data())); paintUser(); if (S.view === "usuarios") render(); }, () => {});
  } else ME.farms.forEach(subFarm);
}
function subFarm(fid) {
  if (farmSubs[fid]) return farmSubs[fid].ready;
  let res; const ready = new Promise(r => res = r); let a = false, b = false; const chk = () => { if (a && b) res(true); };
  const fr = db.collection("farms").doc(fid);
  const u1 = fr.onSnapshot(d => { if (d.exists) S.farms[fid] = d.data(); else delete S.farms[fid]; a = true; chk(); upd(); }, () => { delete farmSubs[fid]; res(false); });
  const u2 = fr.collection("data").onSnapshot(s => {
    Object.keys(S.recs).forEach(k => { if (k.startsWith(fid + "|")) delete S.recs[k]; }); delete S.anims[fid]; delete S.acoes[fid];
    s.forEach(d => { const o = d.data(); if (d.id.startsWith("rec_")) S.recs[recKey(fid, o.ym)] = o; else if (d.id === "anim") S.anims[fid] = o.list || []; else if (d.id === "acoes") S.acoes[fid] = o.list || []; });
    b = true; chk(); upd();
  }, () => { res(false); });
  farmSubs[fid] = {u: [u1, u2], ready}; return ready;
}

/* ---------- gravação ---------- */
const clean = o => JSON.parse(JSON.stringify(o));
// espera a nuvem confirmar por até 2,5 s; sem internet, a gravação fica guardada e sobe quando voltar
function commit(p) {
  return new Promise((res, rej) => { let done = false;
    p.then(() => { done = true; res(); }, e => { if (!done) { done = true; rej(e); } else toast(e && e.code === "permission-denied" ? "Você não tem permissão para alterar estes dados." : "Uma gravação não chegou à nuvem."); });
    setTimeout(() => { if (!done) { done = true; res(); } }, 2500); });
}
function refOf(id) {
  if (id === "livro") return db.collection("program").doc("livro");
  let m = id.match(/^rec_(.+)_(\d{4}-\d{2})$/); if (m) return db.collection("farms").doc(m[1]).collection("data").doc("rec_" + m[2]);
  m = id.match(/^(anim|acoes)_(.+)$/); if (m) return db.collection("farms").doc(m[2]).collection("data").doc(m[1]);
  throw {code: "invalid_argument"};
}
async function writeFarm(f) {
  const fid = f.id, isNew = !S.pub[fid], fr = db.collection("farms").doc(fid), batch = db.batch();
  let salt = null, h = null; if (typeof f.pinHash === "string" && f.pinSalt) { salt = f.pinSalt; h = f.pinHash; }
  const data = clean(f); delete data.pinSalt; data.pinHash = true;
  const pub = {nome: f.nome || "", produtor: f.produtor || "", municipio: f.municipio || ""};
  if (isNew) {
    if (!h) { const r = await askPin(`Crie a senha da fazenda ${farmLabel(f)}. Os estagiários vão digitar esta senha para entrar nela.`); if (!r || !r.pin) throw {code: "cancel"}; salt = uid() + uid(); h = await hashPin(r.pin, salt); }
    data.criadoPor = ME.uid; data.criadoEm = data.criadoEm || iso();
    batch.set(db.collection("farmKeys").doc(fid), {h});
    batch.set(db.collection("farmsPub").doc(fid), Object.assign(pub, {salt}));
    if (ME.role === "estagiario") {
      batch.set(fr.collection("members").doc(ME.uid), {h, nome: ME.nome || "", email: ME.email || "", em: iso()});
      batch.update(db.collection("users").doc(ME.uid), {farms: FV.arrayUnion(fid)});
    }
    batch.set(fr, data);
    await batch.commit();
    S.pub[fid] = Object.assign({id: fid}, pub); if (ME.role === "estagiario" && !ME.farms.includes(fid)) { ME.farms.push(fid); subFarm(fid); }
  } else {
    if (h) { batch.set(db.collection("farmKeys").doc(fid), {h}); pub.salt = salt; }
    batch.set(db.collection("farmsPub").doc(fid), pub, {merge: true}); batch.set(fr, data);
    await commit(batch.commit());
  }
  S.farms[fid] = data;
}
writeDoc = async function (id, obj) {
  if (id.startsWith("farm_")) return writeFarm(obj);
  await commit(refOf(id).set(clean(obj)));
};
delDoc = async function (id) {
  const m = id.match(/^farm_(.+)$/);
  if (m) { const b = db.batch(); b.delete(db.collection("farms").doc(m[1])); b.delete(db.collection("farmsPub").doc(m[1])); b.delete(db.collection("farmKeys").doc(m[1])); await commit(b.commit()); return; }
  await commit(refOf(id).delete());
};
failed = function (e) {
  const c = e && e.code;
  if (c === "cancel") return false;
  toast(c === "permission-denied" ? (ME && ME.role === "tecnico" ? "Técnicos só visualizam os dados." : "Você não tem permissão para alterar estes dados.")
    : c === "invalid_argument" ? "Não foi possível salvar: os dados são grandes demais." : "Não foi possível salvar agora. Tente de novo em instantes.");
  return false;
};
const _guard = guardDemo;
guardDemo = function () { if (ME && ME.role === "tecnico") { toast("Técnicos só visualizam os dados. Para alterar, entre com o login do estagiário."); return true; } return _guard(); };

/* ---------- senha da fazenda (conferida no servidor) ---------- */
isLocked = f => !!(f && !seesAll() && !(ME && ME.farms.includes(f.id)));
unlockFarm = async function (f) {
  if (!f || !f.id || !ME) return false;
  if (seesAll()) return true;
  if (ME.farms.includes(f.id)) return subFarm(f.id);
  const p = S.pub[f.id]; if (!p) return false;
  for (;;) {
    const r = await askPin(`Digite a senha da fazenda ${p.produtor || p.nome}. Você só precisa fazer isso uma vez.`); if (!r || !r.pin) return false;
    const h = await hashPin(r.pin, p.salt); const b = db.batch();
    b.set(db.collection("farms").doc(f.id).collection("members").doc(ME.uid), {h, nome: ME.nome || "", email: ME.email || "", em: iso()});
    b.update(db.collection("users").doc(ME.uid), {farms: FV.arrayUnion(f.id)});
    try { await b.commit(); if (!ME.farms.includes(f.id)) ME.farms.push(f.id); const ok = await subFarm(f.id); toast("Fazenda liberada."); return ok; }
    catch (e) { if (e && e.code === "permission-denied") toast("Senha incorreta."); else { toast("Sem conexão. Para entrar numa fazenda nova é preciso internet."); return false; } }
  }
};

/* ---------- barra lateral ---------- */
const sideBlock = document.getElementById("progBtn").parentElement;
const usersBtn = document.createElement("button"); usersBtn.className = "progbtn"; usersBtn.id = "usersBtn"; usersBtn.hidden = true; sideBlock.appendChild(usersBtn);
usersBtn.onclick = async () => { if (S.view === "usuarios") return; if (!(await leaveOk())) return; S.view = "usuarios"; refreshSide(); render(); };
const userBox = document.createElement("div"); userBox.className = "userbox";
document.getElementById("status").insertAdjacentElement("beforebegin", userBox);
function paintUser() {
  if (!ME) { userBox.innerHTML = ""; return; }
  userBox.innerHTML = `<div><b title="${esc(ME.email || "")}">${esc(ME.nome || ME.email || "")}</b>${esc(ROLES[ME.role] || "")}</div><button type="button" id="logoutBtn">Sair</button>`;
  document.getElementById("logoutBtn").onclick = async () => { if (!(await leaveOk())) return; auth.signOut(); };
  const pend = S.users.filter(u => u.role === "pendente").length;
  usersBtn.innerHTML = "Usuários" + (pend ? `<span class="badge">${pend}</span>` : "");
  document.body.classList.toggle("ro", ME.role === "tecnico");
}
refreshSide = function () {
  if (!ME) return;
  S.demo = false;
  if (S.farmId && !farms()[S.farmId]) S.farmId = null;
  const list = seesAll()
    ? Object.values(S.farms).map(f => ({id: f.id, label: farmLabel(f), lock: false}))
    : Object.values(S.pub).map(p => ({id: p.id, label: p.produtor || p.nome || "Sem nome", lock: !ME.farms.includes(p.id)}));
  list.sort((a, b) => a.label.localeCompare(b.label));
  $("#farmSel").innerHTML = `<option value="">${list.length ? "Selecione" : (S.loaded ? "Nenhum produtor ainda" : "Carregando…")}</option>` +
    list.map(x => `<option value="${x.id}"${x.id === S.farmId ? " selected" : ""}>${esc(x.label)}${x.lock ? " · 🔒" : ""}</option>`).join("") +
    (canEdit() ? `<option value="__new">+ Cadastrar produtor</option>` : "");
  if (S.view === "novo") $("#farmSel").value = "__new";
  $("#menu").hidden = !S.farmId || S.view === "novo" || S.view === "usuarios";
  document.querySelectorAll("#menu button").forEach(b => { if (b.dataset.view === S.view) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
  applyBtns();
};
function applyBtns() {
  if (!ME) return;
  $("#progBtn").hidden = !seesAll() || !S.loaded; $("#livroBtn").hidden = !seesAll() || !S.loaded; usersBtn.hidden = !isAdmin();
  if (S.view === "usuarios") usersBtn.setAttribute("aria-current", "page"); else usersBtn.removeAttribute("aria-current");
}
const _render = render;
render = function () {
  if (!ME) return;
  if ((S.view === "livro" || S.view === "programa") && !seesAll()) S.view = "painel";
  if (S.view === "usuarios") {
    killCharts(); livePreview = null;
    if (isAdmin()) renderUsuarios($("#content")); else { S.view = "painel"; _render(); }
    applyBtns(); return;
  }
  if (S.view === "novo" && !canEdit()) S.view = "painel";
  _render(); applyBtns();
  if (ME.role === "tecnico" && S.farmId) { const h = document.querySelector("#content .page-head"); if (h && !document.querySelector(".ro-banner")) h.insertAdjacentHTML("afterend", `<div class="ro-banner">Modo visualização: técnicos veem os dados mas não alteram.</div>`); }
};

/* ---------- usuários (só coordenação) ---------- */
function renderUsuarios(el) {
  const fname = fid => { const p = S.pub[fid]; return p ? (p.produtor || p.nome) : "fazenda removida"; };
  const us = S.users.slice().sort((a, b) => (a.role === "pendente" ? 0 : 1) - (b.role === "pendente" ? 0 : 1) || (a.nome || "").localeCompare(b.nome || ""));
  el.innerHTML = `<div class="page-head"><div><h1>Usuários</h1><div class="sub">Quem pode entrar no Rotina PDPL</div></div></div>
    <div class="box"><p class="note" style="margin:0 0 10px"><b>Estagiário</b>: vê e altera só as fazendas em que entrou com a senha. <b>Técnico</b>: vê todas as fazendas, sem alterar. <b>Coordenação</b>: vê e altera tudo e libera usuários. <b>Bloqueado</b>: não entra mais.</p>
    <div class="tbl-wrap"><table class="utbl"><thead><tr><th>Nome</th><th>E-mail</th><th>Acesso</th><th>Fazendas</th><th>Desde</th><th></th></tr></thead><tbody>
    ${us.map(u => `<tr class="${u.role === "pendente" ? "pend" : ""}"><td><b>${esc(u.nome || "—")}</b></td><td class="note">${esc(u.email || "")}</td>
      <td><select data-urole="${u.uid}" ${u.uid === ME.uid ? "disabled" : ""} aria-label="Acesso de ${esc(u.nome || u.email || "")}">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}"${u.role === k ? " selected" : ""}>${v}</option>`).join("")}</select></td>
      <td class="note">${(u.farms || []).map(fname).map(esc).join(", ") || "—"}</td><td class="note">${u.criadoEm ? brDate(u.criadoEm.slice(0, 10)) : ""}</td>
      <td>${(u.farms || []).length && u.uid !== ME.uid ? `<button class="btn sm" data-ufarms="${u.uid}">Tirar das fazendas</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="note">Nenhum usuário ainda.</td></tr>`}
    </tbody></table></div></div>
    <div class="box"><h3>Trazer dados da versão antiga</h3><p class="note" style="margin:0 0 10px">No Rotina PDPL do Claude, abra Sobre a fazenda → "Baixar cópia de todos os produtores (.json)". Depois importe o arquivo aqui. O app vai pedir para criar a senha de cada fazenda.</p>
    <button class="btn primary" id="impOld">Importar cópia (.json)</button></div>`;
  document.getElementById("impOld").onclick = () => $("#importFile").click();
  el.querySelectorAll("[data-urole]").forEach(s => s.onchange = async () => {
    try { await db.collection("users").doc(s.dataset.urole).update({role: s.value}); toast("Acesso atualizado."); } catch (e) { toast("Não foi possível alterar."); render(); } });
  el.querySelectorAll("[data-ufarms]").forEach(b => b.onclick = async () => {
    const u = S.users.find(x => x.uid === b.dataset.ufarms); if (!u) return;
    if (!(await ask(`Tirar ${u.nome || u.email} de ${(u.farms || []).length} fazenda(s)? Para voltar, a pessoa vai precisar digitar a senha da fazenda de novo.`, "Tirar"))) return;
    try { const bt = db.batch(); (u.farms || []).forEach(fid => bt.delete(db.collection("farms").doc(fid).collection("members").doc(u.uid))); bt.update(db.collection("users").doc(u.uid), {farms: []}); await bt.commit(); toast("Pronto."); }
    catch (e) { toast("Não foi possível alterar."); } });
}

/* ---------- baixar arquivos direto no navegador ---------- */
saveFile = async function (filename, data) {
  try {
    const blob = data instanceof Blob ? data : new Blob([data], {type: typeof data === "string" ? "application/json" : "application/octet-stream"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); return true;
  } catch (e) { toast("Não foi possível baixar agora."); return false; }
};
document.body.classList.remove("no-dl");
const ver = document.querySelector(".ver"); if (ver) ver.textContent = "Rotina PDPL v" + APP_VERSION;
window.addEventListener("online", () => upd()); window.addEventListener("offline", () => upd());

/* ---------- instalação e atualização ---------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(reg => {
    const offer = w => {
      if (document.querySelector(".upd")) return;
      const d = document.createElement("div"); d.className = "upd"; d.innerHTML = `<span>Nova versão do Rotina PDPL disponível</span><button type="button">Atualizar</button>`;
      d.querySelector("button").onclick = async () => { if (!(await leaveOk())) return; w.postMessage("skip"); };
      document.body.appendChild(d);
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", () => { const w = reg.installing; if (!w) return; w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offer(w); }); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloading) return; reloading = true; location.reload(); });
}
})();
