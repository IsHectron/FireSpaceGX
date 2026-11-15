/* FireSpace GX · controles visuales de la simulación 3D.
   No calcula nada: sólo muestra/oculta grupos de deslizadores, aplica
   entornos de misión moviendo los mismos deslizadores que lee
   simulacion3d.js, y pliega el panel de resultados. */
(function () {
  "use strict";

  var filtro = document.getElementById("filtro");
  var grupos = document.querySelectorAll("[data-grupo]");

  function mostrarGrupo() {
    grupos.forEach(function (g) { g.hidden = g.dataset.grupo !== filtro.value; });
  }
  filtro.addEventListener("change", mostrarGrupo);
  mostrarGrupo();

  // Entornos de misión: mueven los deslizadores y disparan "input",
  // así simulacion3d.js redibuja exactamente igual que si los movieras a mano.
  function fijar(id, valor) {
    var el = document.getElementById(id);
    el.value = valor;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function marcarEntorno() {
    var g = parseFloat(document.getElementById("gravedad").value);
    var o = parseFloat(document.getElementById("oxigeno").value);
    document.querySelectorAll("[data-gravedad]").forEach(function (b) {
      b.setAttribute("aria-pressed", parseFloat(b.dataset.gravedad) === g && parseFloat(b.dataset.oxigeno) === o);
    });
  }
  document.querySelectorAll("[data-gravedad]").forEach(function (b) {
    b.addEventListener("click", function () {
      fijar("gravedad", b.dataset.gravedad);
      fijar("oxigeno", b.dataset.oxigeno);
      marcarEntorno();
    });
  });
  ["gravedad", "oxigeno"].forEach(function (id) {
    document.getElementById(id).addEventListener("input", marcarEntorno);
  });
  marcarEntorno();

  document.getElementById("btnPlegar").addEventListener("click", function (e) {
    var plegado = document.getElementById("panelAnalisis").classList.toggle("plegado");
    e.currentTarget.textContent = plegado ? "+" : "–";
  });

  // Al contraer/expandir el menú lateral, Plotly se reajusta al nuevo ancho.
  window.addEventListener("fsgx:layout", function () {
    setTimeout(function () {
      if (window.Plotly) Plotly.Plots.resize("grafica-llama");
    }, 320);
  });
})();
