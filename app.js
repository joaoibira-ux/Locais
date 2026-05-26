const firebaseConfig = {
  apiKey: "AIzaSyBaqROPsywPgtKjQU7cs1ke1WaqDFhWwn0",
  authDomain: "sistema-gw-36566.firebaseapp.com",
  projectId: "sistema-gw-36566",
  storageBucket: "sistema-gw-36566.firebasestorage.app",
  messagingSenderId: "472820177992",
  appId: "1:472820177992:web:2e1b98c9f6ac3a823d0c7d"
};

const VERSAO = "1.0";
document.getElementById("versao-app").textContent = "v" + VERSAO;

firebase.initializeApp(firebaseConfig);
const db       = firebase.firestore();
const colLocal = db.collection("locais");
const colServ  = db.collection("servicos");

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtArea(v) {
  return (v || 0).toFixed(2).replace(".", ",") + " m²";
}

function parseDecimal(s) {
  const v = parseFloat(String(s).replace(/[^\d,]/g, "").replace(",", "."));
  return isNaN(v) ? 0 : v;
}

// ─── Serviços disponíveis (carregados do Firestore) ───────────────────────────
let servicosDisponiveis = [];

colServ.orderBy("criadoEm", "asc").onSnapshot(snap => {
  servicosDisponiveis = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderCheckboxes(editandoServicos);
});

function renderCheckboxes(selecionados) {
  const wrap = document.getElementById("servicos-check");
  if (servicosDisponiveis.length === 0) {
    wrap.innerHTML = '<p class="check-vazio">Nenhum serviço cadastrado.</p>';
    return;
  }
  wrap.innerHTML = servicosDisponiveis.map(s => {
    const checked = selecionados.some(sel => sel.id === s.id) ? "checked" : "";
    return `
      <label class="check-item">
        <input type="checkbox" value="${s.id}" ${checked} />
        <span>${escHtml(s.nome)}</span>
      </label>`;
  }).join("");
}

// ─── Locais ───────────────────────────────────────────────────────────────────
let locaisCache = {};
let editandoId       = null;
let editandoServicos = [];

function render(docs) {
  const lista = document.getElementById("lista");
  locaisCache = {};

  if (docs.length === 0) {
    lista.innerHTML = '<p class="empty">Nenhum local cadastrado.</p>';
    return;
  }

  lista.innerHTML = docs.map(doc => {
    const l = doc.data();
    locaisCache[doc.id] = l;
    const servs = l.servicos || [];
    const total     = servs.length;
    const concluidos = servs.filter(s => s.status === "concluido").length;
    const progresso  = total > 0
      ? `<div class="prog-bar"><div class="prog-fill" style="width:${Math.round(concluidos/total*100)}%"></div></div>`
      : "";

    const listaServs = servs.length === 0
      ? '<p class="check-vazio">Sem serviços atribuídos.</p>'
      : servs.map((s, i) => `
          <button class="serv-item ${s.status}" onclick="toggleServico('${doc.id}',${i})">
            <span class="serv-icone">${s.status === "concluido" ? "✓" : "○"}</span>
            <span class="serv-nome">${escHtml(s.nome)}</span>
            <span class="serv-badge ${s.status}">${s.status === "concluido" ? "concluído" : "pendente"}</span>
          </button>`).join("");

    return `
      <div class="card">
        <div class="card-acoes">
          <button class="btn-edit" onclick="editarLocal('${doc.id}')" title="Editar">✏</button>
          <button class="btn-del"  onclick="excluir('${doc.id}')"     title="Excluir">✕</button>
        </div>
        <div class="card-top">
          <span class="badge">${escHtml(l.tipo)}</span>
          <span class="card-id">${escHtml(l.identificacao)}</span>
          <span class="card-area">${fmtArea(l.area)}</span>
        </div>
        ${total > 0 ? `<div class="card-prog">${concluidos}/${total} concluídos ${progresso}</div>` : ""}
        <div class="servicos-lista">${listaServs}</div>
      </div>`;
  }).join("");
}

colLocal.orderBy("identificacao", "asc").onSnapshot(snap => {
  render(snap.docs);
}, err => {
  console.error(err);
  document.getElementById("lista").innerHTML =
    '<p class="empty">Erro ao conectar. Verifique sua internet.</p>';
});

// ─── Toggle status de serviço ─────────────────────────────────────────────────
function toggleServico(localId, idx) {
  const l = locaisCache[localId];
  if (!l) return;
  const servicos = [...(l.servicos || [])];
  servicos[idx] = {
    ...servicos[idx],
    status: servicos[idx].status === "concluido" ? "pendente" : "concluido"
  };
  colLocal.doc(localId).update({ servicos });
}

// ─── Formulário ───────────────────────────────────────────────────────────────
document.getElementById("form").addEventListener("submit", function(e) {
  e.preventDefault();
  const tipo          = document.getElementById("f-tipo").value;
  const identificacao = document.getElementById("f-id").value.trim().toUpperCase();
  const area          = parseDecimal(document.getElementById("f-area").value);

  if (!identificacao) {
    alert("Identificação é obrigatória.");
    return;
  }

  // Serviços selecionados nos checkboxes
  const checks  = document.querySelectorAll("#servicos-check input[type=checkbox]:checked");
  const novoIds = Array.from(checks).map(c => c.value);

  // Preserva status de serviços já existentes; novos ficam "pendente"
  const servicosAntigos = editandoId ? (locaisCache[editandoId]?.servicos || []) : [];
  const servicos = novoIds.map(id => {
    const disp    = servicosDisponiveis.find(s => s.id === id);
    const existia = servicosAntigos.find(s => s.id === id);
    return {
      id,
      nome:   disp ? disp.nome : id,
      status: existia ? existia.status : "pendente"
    };
  });

  if (editandoId) {
    colLocal.doc(editandoId).update({ tipo, identificacao, area, servicos });
    editandoId = null;
  } else {
    colLocal.add({ tipo, identificacao, area, servicos,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
  }

  this.reset();
  toggleForm();
});

document.getElementById("f-area").addEventListener("blur", function() {
  const v = parseDecimal(this.value);
  if (v > 0) this.value = v.toFixed(2).replace(".", ",");
});

// ─── Editar ───────────────────────────────────────────────────────────────────
function editarLocal(id) {
  const l = locaisCache[id];
  if (!l) return;
  editandoId       = id;
  editandoServicos = l.servicos || [];

  document.getElementById("form-titulo").textContent = "Editar Local";
  document.getElementById("btn-submit").textContent  = "✓ Salvar alterações";
  document.getElementById("f-tipo").value = l.tipo || "Apartamento";
  document.getElementById("f-id").value   = l.identificacao || "";
  document.getElementById("f-area").value = l.area > 0
    ? l.area.toFixed(2).replace(".", ",") : "";
  renderCheckboxes(editandoServicos);

  const form = document.getElementById("form");
  form.style.display = "block";
  document.getElementById("fab").classList.add("open");
  document.getElementById("f-id").focus();
}

// ─── Excluir ─────────────────────────────────────────────────────────────────
function excluir(id) {
  const l = locaisCache[id];
  if (!l) return;
  const senha = prompt(`EXCLUIR LOCAL?\n\n${l.tipo} — ${l.identificacao}\n\nDigite a senha:`);
  if (senha === null) return;
  if (senha !== "4512") { alert("Senha incorreta."); return; }
  colLocal.doc(id).delete();
}

// ─── Abrir / fechar form ──────────────────────────────────────────────────────
function toggleForm() {
  const form = document.getElementById("form");
  const fab  = document.getElementById("fab");
  const open = form.style.display === "none" || form.style.display === "";
  form.style.display = open ? "block" : "none";
  fab.classList.toggle("open", open);
  if (open) {
    editandoServicos = [];
    renderCheckboxes([]);
    document.getElementById("f-id").focus();
  } else {
    editandoId       = null;
    editandoServicos = [];
    document.getElementById("form-titulo").textContent = "Novo Local";
    document.getElementById("btn-submit").textContent  = "+ Cadastrar";
    document.getElementById("form").reset();
    renderCheckboxes([]);
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
