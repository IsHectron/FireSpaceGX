/* Dashboard de ejemplo (PSI-68) de la página de inicio */
(async function () {
  FSGX.configurarChart();
  const [ej, cat] = await Promise.all([
    fetch('/api/ejemplo').then((r) => r.json()),
    fetch('/api/catalogo').then((r) => r.json()),
  ]);
  const porId = Object.fromEntries(cat.combustibles.map((c) => [c.id, c]));
  const umbral = ej.umbral_riesgo;
  document.getElementById('avisoDemo').textContent = ej.aviso;

  // 1) Liberación de calor por ensayo -------------------------------------
  new Chart(document.getElementById('gCalor'), {
    type: 'line',
    data: {
      labels: ej.ensayos.map((e, i) => `${e} · ${ej.oxigeno[i]}%`),
      datasets: ej.combustibles.map((id, i) => ({
        label: porId[id].nombre,
        data: ej.calor[id],
        borderColor: FSGX.color(id, i),
        backgroundColor: (c) => c.chart.chartArea
          ? FSGX.degradado(c.chart.ctx, c.chart.chartArea, FSGX.color(id, i) + '55', FSGX.color(id, i) + '00') : 'transparent',
        fill: true, tension: 0.42, pointRadius: 3, borderWidth: 2.5,
      })),
    },
    options: {
      scales: { y: { min: 0, max: 100, title: { display: true, text: 'Calor relativo (0-100)' } } },
      plugins: { umbral: { valor: umbral, texto: `Umbral de riesgo (${umbral})` } },
      interaction: { mode: 'index', intersect: false },
    },
    plugins: [FSGX.pluginUmbral],
  });

  // 2) KPIs de pico -------------------------------------------------------
  const kpis = document.getElementById('kpisEjemplo');
  ej.combustibles.forEach((id) => {
    const max = Math.max(...ej.calor[id]);
    const el = document.createElement('div');
    el.className = 'kpi';
    el.innerHTML = `<div class="kpi__anillo"><canvas></canvas><div class="kpi__valor"><div>${max}<small>/ 100</small></div></div></div>
                    <span class="kpi__nombre">${porId[id].nombre}</span>`;
    el.querySelector('.kpi__valor').style.color = max >= umbral ? '#ffa24d' : '#22d3ee';
    kpis.appendChild(el);
    FSGX.anillo(el.querySelector('canvas'), max, 100, max >= umbral ? '#ff7a1a' : '#22d3ee');
  });

  // 3) Componentes del índice --------------------------------------------
  const cl = (v) => Math.max(0, Math.min(1, v));
  const comps = ej.combustibles.map((id) => {
    const c = porId[id];
    return {
      vol: 32 * (c.flash == null ? 1 : cl((60 - c.flash) / 80)),
      rea: 28 * (c.lfl ? cl(1.2 / c.lfl) : 0.25),
      ran: 15 * (c.lfl ? cl((c.ufl - c.lfl) / 35) : 0.1),
      ene: 25 * cl(c.dhc / 50),
    };
  });
  const capas = [['vol', 'Volatilidad', '#ff4d5e'], ['rea', 'Reactividad', '#ff7a1a'], ['ran', 'Rango inflamable', '#ffc93c'], ['ene', 'Energía', '#22d3ee']];
  new Chart(document.getElementById('gComponentes'), {
    type: 'bar',
    data: {
      labels: ej.combustibles.map((id) => porId[id].nombre),
      datasets: capas.map(([k, n, col]) => ({ label: n, data: comps.map((c) => +c[k].toFixed(1)), backgroundColor: col, borderRadius: 3, barPercentage: 0.6 })),
    },
    options: { scales: { x: { stacked: true }, y: { stacked: true, max: 100, title: { display: true, text: 'Índice (0-100)' } } } },
  });

  // 4) Sensibilidad al oxígeno -------------------------------------------
  new Chart(document.getElementById('gOxigeno'), {
    type: 'bubble',
    data: {
      datasets: ej.combustibles.map((id, i) => ({
        label: porId[id].nombre,
        data: ej.calor[id].map((v, k) => ({ x: ej.oxigeno[k], y: v, r: 3 + v / 12 })),
        backgroundColor: FSGX.color(id, i) + '99', borderColor: FSGX.color(id, i),
      })),
    },
    options: {
      scales: { x: { min: 15, max: 36, title: { display: true, text: 'O₂ (%)' } }, y: { min: 0, max: 100, title: { display: true, text: 'Calor relativo' } } },
      plugins: { umbral: { valor: umbral, texto: 'Pico de riesgo' } },
    },
    plugins: [FSGX.pluginUmbral],
  });

  // 5) Rangos de inflamabilidad ------------------------------------------
  const rangos = document.getElementById('rangosEjemplo');
  const escala = 40;
  ej.combustibles.forEach((id) => {
    const c = porId[id];
    rangos.insertAdjacentHTML('beforeend', `
      <div class="rango">
        <div class="rango__cab"><span>${c.nombre} · ${c.programa}</span><span>${c.lfl}% – ${c.ufl}%</span></div>
        <div class="rango__pista"><div class="rango__barra" style="left:${(c.lfl / escala) * 100}%;width:${((c.ufl - c.lfl) / escala) * 100}%"></div></div>
      </div>`);
  });

  // Resumen: ¿qué cantidad representa un pico de riesgo? ------------------
  const frases = ej.combustibles.map((id) => {
    const k = ej.calor[id].findIndex((v) => v >= umbral);
    return k >= 0 ? `${porId[id].nombre} desde ${ej.oxigeno[k]}% O₂` : null;
  }).filter(Boolean);
  document.getElementById('resumenPico').innerHTML = frases.length
    ? `<strong style="color:#ffa24d">Pico de riesgo:</strong> superaron el umbral ${frases.join(', ')}.`
      + (ej.combustibles.includes('metanol') && Math.max(...ej.calor.metanol) < umbral ? ' El metanol nunca lo superó en esta serie, pero su llama casi invisible complica la detección.' : '')
    : 'Ningún compuesto superó el umbral de riesgo en esta serie.';
})();
