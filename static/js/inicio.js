/* =====================================================================
   FireSpace GX · Inicio
   Dashboard de ejemplo (PSI-68). Autocontenido: sólo necesita Chart.js
   y el endpoint GET /api/inicio/dashboard de app.py.
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- datos del dashboard de ejemplo ----------
     Propiedades de combustibles: valores de referencia aproximados de literatura abierta.
     Series por ensayo (calor, oxígeno): DEMOSTRATIVAS. Cuando ApiGx genere dashboards
     con datos de data/firespace.db, reemplaza DATOS por esa respuesta con el mismo formato. */
  const COMBUSTIBLES = {
    metano:  { nombre: 'Metano',    programa: 'ACME', lfl: 5.0,  ufl: 15.0, flash: null, dhc: 50.0, color: '#22d3ee' },
    etileno: { nombre: 'Etileno',   programa: 'ACME', lfl: 2.7,  ufl: 36.0, flash: null, dhc: 47.2, color: '#ff7a1a' },
    heptano: { nombre: 'n-Heptano', programa: 'FLEX', lfl: 1.05, ufl: 6.7,  flash: -4,   dhc: 44.6, color: '#ff4d5e' },
    metanol: { nombre: 'Metanol',   programa: 'FLEX', lfl: 6.0,  ufl: 36.0, flash: 11,   dhc: 19.9, color: '#3b82f6' },
  };
  const EJEMPLO = {
    aviso: 'Datos demostrativos generados para ilustrar el tipo de dashboard que crea ApiGx.',
    ensayos: ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'],
    oxigeno: [17, 19, 21, 21, 25, 27, 30, 34],
    umbral: 70,
    calor: {
      metano:  [22, 30, 41, 38, 52, 47, 58, 61],
      etileno: [35, 44, 50, 63, 71, 66, 78, 82],
      heptano: [28, 39, 55, 49, 60, 74, 69, 77],
      metanol: [12, 15, 19, 18, 24, 22, 27, 29],
    },
  };

  const clamp = (v) => Math.max(0, Math.min(1, v));
  const r1 = (v) => Math.round(v * 10) / 10;
  function componentesRiesgo(c) {
    return {
      volatilidad: r1(32 * (c.flash == null ? 1 : clamp((60 - c.flash) / 80))),
      reactividad: r1(28 * clamp(1.2 / c.lfl)),
      rango: r1(15 * clamp((c.ufl - c.lfl) / 35)),
      energia: r1(25 * clamp(c.dhc / 50)),
    };
  }
  function construirDatos() {
    return {
      aviso: EJEMPLO.aviso, ensayos: EJEMPLO.ensayos, oxigeno: EJEMPLO.oxigeno, umbral: EJEMPLO.umbral,
      compuestos: Object.entries(EJEMPLO.calor).map(([id, serie]) => {
        const c = COMBUSTIBLES[id];
        const cruce = serie.findIndex((v) => v >= EJEMPLO.umbral);
        return {
          id, nombre: c.nombre, programa: c.programa, color: c.color, lfl: c.lfl, ufl: c.ufl,
          calor: serie, pico: Math.max(...serie),
          oxigeno_cruce: cruce >= 0 ? EJEMPLO.oxigeno[cruce] : null,
          componentes: componentesRiesgo(c),
        };
      }),
    };
  }

  /* ---------- estilo global de Chart.js ---------- */
  function configurarChart() {
    Chart.defaults.color = '#8584a6';
    Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
    Chart.defaults.font.size = 11;
    Chart.defaults.borderColor = 'rgba(255,255,255,.06)';
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.boxHeight = 10;
    Chart.defaults.maintainAspectRatio = false;
  }

  /* Franja roja + línea punteada del umbral de riesgo */
  const pluginUmbral = {
    id: 'umbral',
    afterDraw(chart, _args, opts) {
      if (!opts || opts.valor == null || !chart.scales.y) return;
      const { ctx, chartArea: a } = chart;
      const y = chart.scales.y.getPixelForValue(opts.valor);
      ctx.save();
      ctx.fillStyle = 'rgba(255,77,94,.07)';
      ctx.fillRect(a.left, a.top, a.right - a.left, y - a.top);
      ctx.strokeStyle = '#ff4d5e';
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.right, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ff8a95';
      ctx.font = '600 10px Inter, sans-serif';
      ctx.fillText(opts.texto || 'Umbral de riesgo', a.left + 6, y - 5);
      ctx.restore();
    },
  };

  function degradado(chart, color) {
    const a = chart.chartArea;
    if (!a) return 'transparent';
    const g = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
    g.addColorStop(0, color + '55');
    g.addColorStop(1, color + '00');
    return g;
  }

  /* ---------- 1) Liberación de calor por ensayo ---------- */
  function graficaCalor(d) {
    new Chart(document.getElementById('gCalor'), {
      type: 'line',
      data: {
        labels: d.ensayos.map((e, i) => `${e} · ${d.oxigeno[i]}%`),
        datasets: d.compuestos.map((c) => ({
          label: c.nombre,
          data: c.calor,
          borderColor: c.color,
          backgroundColor: (ctx) => degradado(ctx.chart, c.color),
          fill: true, tension: 0.42, pointRadius: 3, borderWidth: 2.5,
        })),
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: { y: { min: 0, max: 100, title: { display: true, text: 'Calor relativo (0-100)' } } },
        plugins: { umbral: { valor: d.umbral, texto: `Umbral de riesgo (${d.umbral})` } },
      },
      plugins: [pluginUmbral],
    });
  }

  /* ---------- 2) Pico máximo por compuesto (anillos) ---------- */
  function kpis(d) {
    const cont = document.getElementById('kpisEjemplo');
    cont.innerHTML = '';
    d.compuestos.forEach((c) => {
      const peligro = c.pico >= d.umbral;
      const color = peligro ? '#ff7a1a' : '#22d3ee';
      const el = document.createElement('div');
      el.className = 'kpi';
      el.innerHTML =
        `<div class="kpi__anillo"><canvas></canvas>
           <div class="kpi__valor" style="color:${peligro ? '#ffa24d' : '#22d3ee'}"><div>${c.pico}<small>/ 100</small></div></div>
         </div>
         <span class="kpi__nombre">${c.nombre}</span>`;
      cont.appendChild(el);
      new Chart(el.querySelector('canvas'), {
        type: 'doughnut',
        data: { datasets: [{ data: [c.pico, 100 - c.pico], backgroundColor: [color, '#141b4a'], borderWidth: 0 }] },
        options: { cutout: '78%', plugins: { legend: { display: false }, tooltip: { enabled: false } } },
      });
    });
  }

  /* ---------- 3) Composición del índice de riesgo ---------- */
  function graficaComponentes(d) {
    const capas = [
      ['volatilidad', 'Volatilidad', '#ff4d5e'],
      ['reactividad', 'Reactividad', '#ff7a1a'],
      ['rango', 'Rango inflamable', '#ffc93c'],
      ['energia', 'Energía', '#22d3ee'],
    ];
    new Chart(document.getElementById('gComponentes'), {
      type: 'bar',
      data: {
        labels: d.compuestos.map((c) => c.nombre),
        datasets: capas.map(([k, nombre, color]) => ({
          label: nombre,
          data: d.compuestos.map((c) => c.componentes[k]),
          backgroundColor: color, borderRadius: 3, barPercentage: 0.6,
        })),
      },
      options: {
        scales: { x: { stacked: true }, y: { stacked: true, max: 100, title: { display: true, text: 'Índice (0-100)' } } },
      },
    });
  }

  /* ---------- 4) Sensibilidad al oxígeno ---------- */
  function graficaOxigeno(d) {
    new Chart(document.getElementById('gOxigeno'), {
      type: 'bubble',
      data: {
        datasets: d.compuestos.map((c) => ({
          label: c.nombre,
          data: c.calor.map((v, i) => ({ x: d.oxigeno[i], y: v, r: 3 + v / 12 })),
          backgroundColor: c.color + '99',
          borderColor: c.color,
        })),
      },
      options: {
        scales: {
          x: { min: 15, max: 36, title: { display: true, text: 'O₂ (%)' } },
          y: { min: 0, max: 100, title: { display: true, text: 'Calor relativo' } },
        },
        plugins: { umbral: { valor: d.umbral, texto: 'Pico de riesgo' } },
      },
      plugins: [pluginUmbral],
    });
  }

  /* ---------- 5) Rangos de inflamabilidad ---------- */
  function rangos(d) {
    const escala = 40; // % vol que ocupa todo el ancho
    document.getElementById('rangosEjemplo').innerHTML = d.compuestos.map((c) => `
      <div class="rango">
        <div class="rango__cab"><span>${c.nombre} · ${c.programa}</span><span>${c.lfl}% – ${c.ufl}%</span></div>
        <div class="rango__pista">
          <div class="rango__barra" style="left:${(c.lfl / escala) * 100}%;width:${((c.ufl - c.lfl) / escala) * 100}%"></div>
        </div>
      </div>`).join('');
  }

  /* ---------- Resumen: ¿qué cantidad representa un pico de riesgo? ---------- */
  function resumen(d) {
    const cruzan = d.compuestos.filter((c) => c.oxigeno_cruce != null);
    const seguros = d.compuestos.filter((c) => c.oxigeno_cruce == null);
    let html = cruzan.length
      ? `<strong style="color:#ffa24d">Pico de riesgo:</strong> superaron el umbral ` +
        cruzan.map((c) => `${c.nombre} desde ${c.oxigeno_cruce}% O₂`).join(', ') + '.'
      : 'Ningún compuesto superó el umbral de riesgo en esta serie.';
    if (seguros.some((c) => c.id === 'metanol')) {
      html += ' El metanol nunca lo superó, pero su llama casi invisible complica la detección.';
    }
    document.getElementById('resumenPico').innerHTML = html;
  }

  /* ---------- arranque ---------- */
  function iniciar() {
    const resumenEl = document.getElementById('resumenPico');
    if (!resumenEl) return; // no estamos en la página de inicio

    if (typeof Chart === 'undefined') {
      resumenEl.textContent = 'No se pudo cargar Chart.js. Revisa tu conexión o la etiqueta <script> de Chart.js.';
      return;
    }
    configurarChart();

    try {
      const d = construirDatos();

      document.getElementById('avisoDemo').textContent = d.aviso;
      graficaCalor(d);
      kpis(d);
      graficaComponentes(d);
      graficaOxigeno(d);
      rangos(d);
      resumen(d);
    } catch (err) {
      console.error('Dashboard de inicio:', err);
      resumenEl.textContent = 'No se pudieron cargar los datos del dashboard (' + err.message + ').';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
