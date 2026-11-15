/* =====================================================================
   FireSpace GX · Asistente IA (ApiGx)
   La lógica de conversación es la misma de antes:
     - POST /api/preguntar con {pregunta, historial}
     - memoria del último intercambio en sessionStorage
     - fuentes citadas con enlace al documento original
   Lo nuevo es sólo visual: chat, sugerencias y un dashboard que se arma
   con las fuentes, experimentos y combustibles de la conversación.
   ===================================================================== */
(function () {
  "use strict";

  // ---------- Memoria: solo el intercambio anterior ----------
  // Se guarda en sessionStorage: dura mientras la pestaña esté abierta
  // (aunque cambies a Inicio o Simulación) y se borra al cerrarla.
  const CLAVE_MEMORIA = "firespace_ultimo_turno";
  const CLAVE_DASHBOARD = "firespace_dashboard";

  const raiz = document.getElementById("asistente");
  const mensajes = document.getElementById("mensajes");
  const botonNueva = document.getElementById("nueva");
  const mascotaSrc = document.querySelector(".bienvenida .mascota").getAttribute("src");
  let enviando = false;

  function cargarUltimoTurno() {
    try {
      const turno = JSON.parse(sessionStorage.getItem(CLAVE_MEMORIA));
      return turno && typeof turno.pregunta === "string" ? turno : null;
    } catch (e) {
      return null;
    }
  }

  function guardarUltimoTurno(turno) {
    try {
      if (turno) sessionStorage.setItem(CLAVE_MEMORIA, JSON.stringify(turno));
      else sessionStorage.removeItem(CLAVE_MEMORIA);
    } catch (e) {
      // Si el navegador no permite guardar, el seguimiento solo dura en esta página.
    }
  }

  let ultimoTurno = cargarUltimoTurno(); // {pregunta, respuesta, fuentes} o null

  function historialParaServidor() {
    if (!ultimoTurno) return [];
    return [
      { rol: "usuario", texto: ultimoTurno.pregunta },
      { rol: "asistente", texto: ultimoTurno.respuesta }
    ];
  }

  // ---------- Sugerencias por tipo de pregunta ----------
  const SUGERENCIAS = {
    consultar: [
      "¿Por qué las llamas son esféricas en microgravedad?",
      "Háblame del comportamiento de las llamas de metanol",
      "¿Qué es una llama fría?"
    ],
    investigaciones: [
      "¿Qué es el experimento Saffire?",
      "¿Qué combustibles gaseosos se probaron en ACME?",
      "¿Qué estudió el experimento FLEX?"
    ],
    resultados: [
      "¿Qué se observó con las gotas de heptano en FLEX?",
      "¿Cómo se propaga el fuego sobre sólidos en microgravedad?",
      "¿Cómo influye la concentración de oxígeno en un incendio en una nave?"
    ]
  };

  function fijarModo(modo) {
    document.querySelectorAll("[data-modo]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.modo === modo));
    document.querySelectorAll("[data-ejemplos]").forEach((cont) => {
      cont.replaceChildren(...SUGERENCIAS[modo].map(crearChip));
    });
  }

  function crearChip(texto) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.dataset.ejemplo = "";
    b.textContent = texto;
    return b;
  }

  document.addEventListener("click", (e) => {
    const modo = e.target.closest("[data-modo]");
    if (modo) return fijarModo(modo.dataset.modo);

    const abrir = e.target.closest("[data-abrir-modos]");
    if (abrir) {
      const menu = abrir.closest("form").querySelector(".menu-modos");
      if (menu) menu.hidden = !menu.hidden;
      return;
    }

    const ejemplo = e.target.closest("[data-ejemplo]");
    if (ejemplo) {
      document.querySelectorAll(".menu-modos").forEach((m) => (m.hidden = true));
      return enviar(ejemplo.textContent);
    }

    if (!e.target.closest(".menu-modos")) document.querySelectorAll(".menu-modos").forEach((m) => (m.hidden = true));
  });

  // ---------- Mostrar en pantalla ----------

  function escapar(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function urlSegura(url) {
    return typeof url === "string" && url.startsWith("https://") ? url : null;
  }

  // Número de cita -> fuente (el servidor agrupa citas del mismo documento: id "1, 3")
  function mapaDeCitas(fuentes) {
    const mapa = {};
    for (const f of fuentes) {
      String(f.id).split(",").forEach((n) => (mapa[n.trim()] = f));
    }
    return mapa;
  }

  // Texto plano con guiones -> párrafos y listas; [n] -> enlace a la fuente
  function formatearRespuesta(texto, fuentes) {
    const mapa = mapaDeCitas(fuentes);
    const enlazarCitas = (html) =>
      html.replace(/\[(\d+)\]/g, (m, n) => {
        const f = mapa[n];
        const url = f && urlSegura(f.url);
        return url
          ? `<a class="cita" href="${escapar(url)}" target="_blank" rel="noopener noreferrer" title="${escapar(f.titulo)}">${n}</a>`
          : `<span class="cita">${n}</span>`;
      });

    return texto.split(/\n{2,}/).map((bloque) => {
      const lineas = bloque.split("\n");
      const html = [];
      let lista = [];
      const cerrarLista = () => {
        if (lista.length) html.push("<ul>" + lista.map((l) => `<li>${l}</li>`).join("") + "</ul>");
        lista = [];
      };
      for (const linea of lineas) {
        const t = linea.trim();
        if (!t) continue;
        if (/^[-•]\s+/.test(t)) lista.push(enlazarCitas(escapar(t.replace(/^[-•]\s+/, ""))));
        else { cerrarLista(); html.push(`<p>${enlazarCitas(escapar(t))}</p>`); }
      }
      cerrarLista();
      return html.join("");
    }).join("");
  }

  function crearListaFuentes(fuentes) {
    if (!fuentes.length) return null;
    const cont = document.createElement("div");
    cont.className = "fuentes-msg";
    const titulo = document.createElement("p");
    titulo.className = "fuentes-msg__titulo";
    titulo.textContent = "Fuentes:";
    const lista = document.createElement("ul");
    for (const f of fuentes) {
      const li = document.createElement("li");
      li.appendChild(document.createTextNode("[" + f.id + "] " + f.fuente + " — "));
      const url = urlSegura(f.url);
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = f.titulo;
        li.appendChild(a);
      } else {
        li.appendChild(document.createTextNode(f.titulo));
      }
      lista.appendChild(li);
    }
    cont.append(titulo, lista);
    return cont;
  }

  function entrarAlChat(pregunta) {
    if (!raiz.classList.contains("con-chat")) {
      raiz.classList.add("con-chat");
      document.getElementById("tituloChat").textContent =
        pregunta.length > 48 ? pregunta.slice(0, 48) + "…" : pregunta;
      setTimeout(redimensionarGraficas, 50);
    }
  }

  function agregarPregunta(pregunta) {
    const d = document.createElement("div");
    d.className = "msg msg--usuario";
    d.textContent = pregunta;
    mensajes.appendChild(d);
  }

  function agregarRespuestaVacia() {
    const d = document.createElement("div");
    d.className = "msg msg--apigx";
    d.innerHTML = `<img class="mascota" src="${escapar(mascotaSrc)}" alt="">
      <div class="msg__cuerpo"><div class="escribiendo" aria-label="Pensando"><span></span><span></span><span></span> Pensando…</div></div>`;
    mensajes.appendChild(d);
    mensajes.scrollTop = mensajes.scrollHeight;
    return d.querySelector(".msg__cuerpo");
  }

  function mostrarRespuesta(cuerpo, respuesta, fuentes) {
    cuerpo.innerHTML = formatearRespuesta(respuesta, fuentes);
    const lista = crearListaFuentes(fuentes);
    if (lista) cuerpo.appendChild(lista);
  }

  function mostrarError(cuerpo, error) {
    cuerpo.innerHTML = "";
    const p = document.createElement("p");
    p.className = "msg__error";
    p.textContent = "Error: " + error;
    cuerpo.appendChild(p);
  }

  // ---------- Envío de preguntas ----------

  async function enviar(texto) {
    const pregunta = String(texto || "").trim();
    if (!pregunta || enviando) return;

    enviando = true;
    document.querySelectorAll("[data-form-consulta] .pill__enviar").forEach((b) => (b.disabled = true));
    entrarAlChat(pregunta);
    agregarPregunta(pregunta);
    const cuerpo = agregarRespuestaVacia();

    try {
      const r = await fetch("/api/preguntar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta, historial: historialParaServidor() })
      });

      let datos;
      try {
        datos = await r.json();
      } catch (e) {
        datos = { ok: false, error: "el servidor respondió algo inesperado (código " + r.status + ")." };
      }

      if (datos.ok) {
        const fuentes = datos.fuentes || [];
        mostrarRespuesta(cuerpo, datos.respuesta, fuentes);
        ultimoTurno = { pregunta, respuesta: datos.respuesta, fuentes };
        guardarUltimoTurno(ultimoTurno);
        registrarEnDashboard(pregunta, datos.respuesta, fuentes);
      } else {
        // Los errores se muestran, pero no reemplazan a la pregunta anterior en la memoria.
        mostrarError(cuerpo, datos.error);
      }
    } catch (e) {
      mostrarError(cuerpo, "no se pudo conectar con el servidor.");
    } finally {
      enviando = false;
      document.querySelectorAll("[data-form-consulta] .pill__enviar").forEach((b) => (b.disabled = false));
      mensajes.scrollTop = mensajes.scrollHeight;
      document.querySelector(".chat__entrada input").focus();
    }
  }

  function nuevaConversacion() {
    ultimoTurno = null;
    guardarUltimoTurno(null);
    reiniciarDashboard();
    mensajes.replaceChildren();
    raiz.classList.remove("con-chat", "dash-abierto");
    document.querySelector(".bienvenida input").focus();
  }

  document.querySelectorAll("[data-form-consulta]").forEach((form) =>
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = form.querySelector('input[name="pregunta"]');
      const texto = input.value;
      input.value = "";
      enviar(texto);
    })
  );
  botonNueva.addEventListener("click", nuevaConversacion);

  // ---------- Expandir / contraer el dashboard ----------
  document.querySelectorAll("[data-toggle-dash]").forEach((b) =>
    b.addEventListener("click", () => {
      const abierto = raiz.classList.toggle("dash-abierto");
      document.querySelector(".dash__toggle").setAttribute("aria-label", abierto ? "Volver a la conversación" : "Expandir dashboard");
      setTimeout(redimensionarGraficas, 60);
    })
  );

  /* =====================================================================
     DASHBOARD DE LA CONVERSACIÓN
     ===================================================================== */
  const PALETA = ["#22d3ee", "#ff7a1a", "#a78bfa", "#3ddc97", "#ff4d5e", "#ffc93c", "#3b82f6", "#f472b6"];
  const EXPERIMENTOS = ["ACME", "FLEX", "SAFFIRE", "BASS", "SOFIE", "FLARE", "DAFT", "SPICE", "SAME", "CFI", "CIR", "MDCA"];

  // Propiedades de referencia aproximadas (literatura abierta) para el índice ilustrativo.
  const COMBUSTIBLES = {
    metano:  { nombre: "Metano",    palabras: /\b(metano|methane)\b/i,           lfl: 5.0,  ufl: 15.0, flash: null, dhc: 50.0, color: "#22d3ee" },
    etileno: { nombre: "Etileno",   palabras: /\b(etileno|ethylene)\b/i,         lfl: 2.7,  ufl: 36.0, flash: null, dhc: 47.2, color: "#ff7a1a" },
    propano: { nombre: "Propano",   palabras: /\b(propano|propane)\b/i,          lfl: 2.1,  ufl: 9.5,  flash: null, dhc: 46.4, color: "#a78bfa" },
    metanol: { nombre: "Metanol",   palabras: /\b(metanol|methanol)\b/i,         lfl: 6.0,  ufl: 36.0, flash: 11,   dhc: 19.9, color: "#3b82f6" },
    etanol:  { nombre: "Etanol",    palabras: /\b(etanol|ethanol)\b/i,           lfl: 3.3,  ufl: 19.0, flash: 13,   dhc: 26.8, color: "#3ddc97" },
    heptano: { nombre: "n-Heptano", palabras: /\b(n-)?(heptano|heptane)\b/i,     lfl: 1.05, ufl: 6.7,  flash: -4,   dhc: 44.6, color: "#ff4d5e" },
    decano:  { nombre: "n-Decano",  palabras: /\b(n-)?(decano|decane)\b/i,       lfl: 0.8,  ufl: 5.4,  flash: 46,   dhc: 44.2, color: "#ffc93c" },
  };
  const UMBRAL = 70;

  const vacio = () => ({ citas: {}, origen: {}, experimentos: {}, combustibles: [] });
  let dash = cargarDashboard();
  const ajustes = { activos: new Set(), cantidad: 0.5, oxigeno: 21 };
  const graficas = {};

  function cargarDashboard() {
    try {
      const d = JSON.parse(sessionStorage.getItem(CLAVE_DASHBOARD));
      return d && d.citas ? d : vacio();
    } catch (e) {
      return vacio();
    }
  }
  function guardarDashboard() {
    try { sessionStorage.setItem(CLAVE_DASHBOARD, JSON.stringify(dash)); } catch (e) {}
  }
  function reiniciarDashboard() {
    dash = vacio();
    ajustes.activos.clear();
    guardarDashboard();
    pintarDashboard();
  }

  function registrarEnDashboard(pregunta, respuesta, fuentes) {
    // Citas por documento (cuántas veces aparece cada [n] en la respuesta)
    const veces = {};
    (respuesta.match(/\[(\d+)\]/g) || []).forEach((m) => (veces[m.slice(1, -1)] = (veces[m.slice(1, -1)] || 0) + 1));
    for (const f of fuentes) {
      const total = String(f.id).split(",").reduce((a, n) => a + (veces[n.trim()] || 1), 0);
      dash.citas[f.titulo] = (dash.citas[f.titulo] || 0) + total;
      const via = String(f.fuente || "").split(",")[0].trim() || "Lista oficial del reto";
      dash.origen[via] = (dash.origen[via] || 0) + total;
    }
    // Experimentos y combustibles mencionados
    const texto = pregunta + "\n" + respuesta;
    for (const sigla of EXPERIMENTOS) {
      const re = new RegExp("\\b" + sigla + "\\b", sigla === "SAFFIRE" ? "gi" : "g");
      const n = (texto.match(re) || []).length;
      if (n) dash.experimentos[sigla] = (dash.experimentos[sigla] || 0) + n;
    }
    for (const [id, c] of Object.entries(COMBUSTIBLES)) {
      if (c.palabras.test(texto) && !dash.combustibles.includes(id)) {
        dash.combustibles.push(id);
        ajustes.activos.add(id);
      }
    }
    guardarDashboard();
    pintarDashboard();
  }

  function configurarChart() {
    Chart.defaults.color = "#8584a6";
    Chart.defaults.font.family = "Inter, system-ui, sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.borderColor = "rgba(255,255,255,.06)";
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.boxHeight = 10;
    Chart.defaults.maintainAspectRatio = false;
  }

  function graficar(clave, canvasId, config) {
    if (graficas[clave]) graficas[clave].destroy();
    graficas[clave] = new Chart(document.getElementById(canvasId), config);
  }

  function redimensionarGraficas() {
    Object.values(graficas).forEach((g) => g && g.resize());
  }

  const recortar = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  function pintarDashboard() {
    if (typeof Chart === "undefined") return;
    const hayDatos = Object.keys(dash.citas).length || Object.keys(dash.experimentos).length || dash.combustibles.length;
    document.getElementById("dashVacio").hidden = !!hayDatos;
    document.querySelector(".dash__grid").hidden = !hayDatos;
    if (!hayDatos) return;

    // 1) Documentos citados
    const docs = Object.entries(dash.citas).sort((a, b) => b[1] - a[1]).slice(0, 8);
    graficar("fuentes", "dFuentes", {
      type: "bar",
      data: {
        labels: docs.map(([t]) => ((t.match(/\(([^)]+)\)\s*$/) || [])[1] || recortar(t, 26))),
        datasets: [{ label: "Citas", data: docs.map(([, n]) => n), backgroundColor: docs.map((_, i) => PALETA[i % PALETA.length]), borderRadius: 4 }]
      },
      options: {
        indexAxis: "y",
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => docs[it[0].dataIndex][0] } } },
        scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });

    // 2) Origen de las fuentes
    const origen = Object.entries(dash.origen);
    graficar("origen", "dOrigen", {
      type: "doughnut",
      data: {
        labels: origen.map(([o]) => o),
        datasets: [{ data: origen.map(([, n]) => n), backgroundColor: ["#ff7a1a", "#22d3ee", "#a78bfa", "#3ddc97"], borderWidth: 0 }]
      },
      options: { cutout: "62%", plugins: { legend: { position: "bottom" } } }
    });

    // 3) Experimentos mencionados
    const exps = Object.entries(dash.experimentos).sort((a, b) => b[1] - a[1]);
    graficar("experimentos", "dExperimentos", {
      type: "bar",
      data: {
        labels: exps.map(([e]) => e),
        datasets: [{ label: "Menciones", data: exps.map(([, n]) => n), backgroundColor: "#ff7a1a", borderRadius: 4 }]
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    pintarCombustibles();
  }

  /* ---------- índice ilustrativo para combustibles ---------- */
  function peligrosidad(c) {
    const cl = (v) => Math.max(0, Math.min(1, v));
    const vol = c.flash == null ? 1 : cl((60 - c.flash) / 80);
    return 0.32 * vol + 0.28 * cl(1.2 / c.lfl) + 0.15 * cl((c.ufl - c.lfl) / 35) + 0.25 * cl(c.dhc / 50);
  }
  function riesgo(c, cantidad, oxigeno) {
    return Math.min(100, Math.round(peligrosidad(c) * (0.45 + 0.55 * cantidad) * Math.pow(oxigeno / 21, 1.6) * 100));
  }

  const pluginUmbral = {
    id: "umbral",
    afterDraw(chart, _a, opts) {
      if (!opts || opts.valor == null || !chart.scales.y) return;
      const { ctx, chartArea: a } = chart;
      const y = chart.scales.y.getPixelForValue(opts.valor);
      ctx.save();
      ctx.fillStyle = "rgba(255,77,94,.07)";
      ctx.fillRect(a.left, a.top, a.right - a.left, y - a.top);
      ctx.strokeStyle = "#ff4d5e"; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.right, y); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = "#ff8a95"; ctx.font = "600 10px Inter, sans-serif";
      ctx.fillText("Peligro", a.left + 6, y - 5);
      if (opts.x != null && chart.scales.x) {
        const x = chart.scales.x.getPixelForValue(opts.x);
        ctx.strokeStyle = "#fff"; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom); ctx.stroke();
      }
      ctx.restore();
    }
  };

  function pintarCombustibles() {
    const hay = dash.combustibles.length > 0;
    document.getElementById("panelCombustibles").hidden = !hay;
    document.querySelectorAll("[data-solo-combustibles]").forEach((el) => (el.hidden = !hay));
    if (!hay) return;

    if (!ajustes.activos.size) dash.combustibles.forEach((id) => ajustes.activos.add(id));
    const chips = document.getElementById("chipsCombustibles");
    chips.replaceChildren(...dash.combustibles.map((id) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.dataset.comb = id;
      b.setAttribute("aria-pressed", ajustes.activos.has(id));
      b.textContent = COMBUSTIBLES[id].nombre;
      return b;
    }));

    const ids = dash.combustibles.filter((id) => ajustes.activos.has(id));
    const xs = Array.from({ length: 21 }, (_, i) => i * 5);
    graficar("curva", "dCurva", {
      type: "line",
      data: {
        labels: xs.map((x) => x + "%"),
        datasets: ids.map((id) => ({
          label: COMBUSTIBLES[id].nombre,
          data: xs.map((x) => riesgo(COMBUSTIBLES[id], x / 100, ajustes.oxigeno)),
          borderColor: COMBUSTIBLES[id].color, backgroundColor: COMBUSTIBLES[id].color + "22",
          fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2.5
        }))
      },
      options: {
        animation: false,
        interaction: { mode: "index", intersect: false },
        scales: { y: { min: 0, max: 100 }, x: { ticks: { maxTicksLimit: 6 } } },
        plugins: { umbral: { valor: UMBRAL, x: Math.round(ajustes.cantidad * 20) } }
      },
      plugins: [pluginUmbral]
    });

    // Estado textual
    let peor = null;
    ids.forEach((id) => {
      const v = riesgo(COMBUSTIBLES[id], ajustes.cantidad, ajustes.oxigeno);
      if (!peor || v > peor.v) peor = { id, v };
    });
    const est = document.getElementById("estadoRiesgo");
    if (!peor) { est.className = "estado-riesgo"; est.textContent = "Selecciona al menos un combustible."; }
    else {
      const nombre = COMBUSTIBLES[peor.id].nombre;
      const cruce = xs.find((x) => riesgo(COMBUSTIBLES[peor.id], x / 100, ajustes.oxigeno) >= UMBRAL);
      est.className = "estado-riesgo " + (peor.v >= UMBRAL ? "peligro" : peor.v >= 40 ? "precaucion" : "");
      est.textContent = peor.v >= UMBRAL
        ? `⚠ ${nombre}: índice ${peor.v}/100 con ${Math.round(ajustes.cantidad * 100)}% de cantidad y ${ajustes.oxigeno}% O₂.`
        : cruce != null
          ? `${nombre} (índice ${peor.v}) cruzaría el umbral desde ${cruce}% de cantidad.`
          : `Ningún combustible alcanza el umbral con ${ajustes.oxigeno}% O₂.`;
    }

    document.getElementById("dRangos").innerHTML = ids.map((id) => {
      const c = COMBUSTIBLES[id];
      return `<div class="rango"><div class="rango__cab"><span>${c.nombre}</span><span>${c.lfl}–${c.ufl}%</span></div>
        <div class="rango__pista"><div class="rango__barra" style="left:${(c.lfl / 40) * 100}%;width:${((c.ufl - c.lfl) / 40) * 100}%"></div></div></div>`;
    }).join("");
  }

  document.getElementById("chipsCombustibles").addEventListener("click", (e) => {
    const b = e.target.closest("[data-comb]");
    if (!b) return;
    const id = b.dataset.comb;
    ajustes.activos.has(id) ? ajustes.activos.delete(id) : ajustes.activos.add(id);
    pintarCombustibles();
  });
  const rC = document.getElementById("rCantidad");
  const rO = document.getElementById("rOxigeno");
  rC.addEventListener("input", () => { ajustes.cantidad = rC.value / 100; document.getElementById("oCantidad").textContent = rC.value + "%"; pintarCombustibles(); });
  rO.addEventListener("input", () => { ajustes.oxigeno = +rO.value; document.getElementById("oOxigeno").textContent = rO.value + "%"; pintarCombustibles(); });

  // ---------- Arranque ----------
  if (typeof Chart !== "undefined") configurarChart();
  fijarModo("consultar");

  // Al volver a esta página, se muestra la última respuesta de esta pestaña.
  if (ultimoTurno) {
    entrarAlChat(ultimoTurno.pregunta);
    agregarPregunta(ultimoTurno.pregunta);
    mostrarRespuesta(agregarRespuestaVacia(), ultimoTurno.respuesta, ultimoTurno.fuentes || []);
  }
  pintarDashboard();
})();
