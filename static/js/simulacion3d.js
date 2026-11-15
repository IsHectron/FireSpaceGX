/* FireSpace — Simulación 3D de una llama con Plotly
 *
 * Modelo ilustrativo (no es un cálculo físico riguroso):
 *  - Gravedad:  en 1 g la llama es alargada, en forma de gota.
 *               en 0 g (microgravedad) tiende a ser esférica, como
 *               se observa en los experimentos de combustión en la ISS.
 *  - Oxígeno:   más O2 -> llama más grande, más caliente y con el
 *               núcleo más azulado/blanco. Menos O2 -> más pequeña,
 *               tenue y anaranjada.
 *  - Tamaño:    escala general de la llama (1 a 10).
 *
 * ESCALA — 1 unidad = 1 cm (aprox.)
 *   La escala es relativa porque el proyecto no define un quemador
 *   real. Se ancla así: quemador de 0,6 cm de diámetro por defecto
 *   (configurable en la página); con tamaño 5, 1 g y 21 % de O2 la
 *   llama mide ~8 cm de alto y ~3 cm de ancho, como una llama
 *   pequeña de laboratorio.
 *   Si el usuario pone el diámetro real de su quemador, todas las
 *   medidas en cm se recalculan en la misma proporción
 *   (factor = diámetro / 0,6): un quemador del doble de diámetro
 *   da una llama del doble de alto y de ancho. La forma y la
 *   temperatura estimada no cambian con el diámetro en este modelo
 *   ilustrativo: dependen de la gravedad y del oxígeno.
 *
 * COLOR Y TEMPERATURA — sí, en experimentos reales la llama
 * cambia de color con la temperatura, pero no solo por radiación
 * de cuerpo negro:
 *   - Amarillo/naranja: incandescencia del hollín. El hollín
 *     caliente brilla como una brasa (~1000-1400 °C). Es la
 *     llama típica, luminosa y con humo, de combustión incompleta.
 *   - Azul: quimiluminiscencia de radicales CH* y C2* (~430 y
 *     516 nm). Aparece con combustión completa, poco hollín,
 *     mucho oxígeno y/o microgravedad. Por eso las llamas de la
 *     ISS y las de un mechero bien regulado se ven azules, aunque
 *     sean más calientes que una llama amarilla.
 *   Por eso el color aquí no es un degradado suave: hay regímenes
 *   (rojo -> naranja -> amarillo -> amarillo-blanco -> azul-blanco)
 *   según la temperatura máxima estimada.
 *
 * La llama se dibuja con 3 capas Mesh3d anidadas (exterior, media
 * e interior) + una nube de puntos Scatter3d que representa el
 * volumen caliente. La llama nace POR ENCIMA del quemador, unida
 * a él solo por una mecha fina, para que el cilindro no la tape.
 */

(function () {
  "use strict";

  var GRAFICA_ID = "grafica-llama";
  var BASE_Z = 0.4; // la base de la llama queda 0,4 cm sobre el quemador
  var TEMP_MIN = 600; // °C, borde frío de la llama (para la escala de color)
  var TEMP_MAX = 1600; // °C, tope de la escala de color
  var QUEMADOR_REF_CM = 0.6; // diámetro de referencia de la escala (cm)
  var QUEMADOR_MIN_CM = 0.2;
  var QUEMADOR_MAX_CM = 2.0;

  // ---------- Parámetros físicos (ilustrativos) ----------

  function calcularParametros(gravedad, oxigeno, tamano, diametroQuemador) {
    // Diámetro del quemador (cm): lo pone el usuario; si falta o
    // es inválido, se usa la referencia de 0,6 cm.
    var diametro = parseFloat(diametroQuemador);
    if (!isFinite(diametro) || diametro <= 0) diametro = QUEMADOR_REF_CM;
    diametro = clamp(diametro, QUEMADOR_MIN_CM, QUEMADOR_MAX_CM);

    // Factor de escala: todas las medidas en cm son proporcionales
    // al diámetro del quemador respecto a la referencia de 0,6 cm.
    var factorEscala = diametro / QUEMADOR_REF_CM;

    // Factor por oxígeno: 15% -> 0.75, 21% -> 0.90, 35% -> 1.25
    var fO2 = 0.75 + ((oxigeno - 15) / 20) * 0.5;

    // Ancho (diámetro máximo) y altura en cm (1 unidad = 1 cm).
    // Tamaño 5, g=1, quemador 0,6 cm: alto ~8 cm, ancho ~3,2 cm (gota)
    // Tamaño 5, g=0, quemador 0,6 cm: alto ~4 cm, ancho ~4 cm (esfera)
    // Con otro quemador, alto y ancho se multiplican por factorEscala.
    var ancho = tamano * (0.9 - 0.18 * gravedad) * fO2 * factorEscala;
    var altura = tamano * (0.9 + 0.9 * gravedad) * fO2 * factorEscala;

    // Temperatura máxima estimada (°C, ilustrativa).
    // Rango del modelo: 950 °C (15 % O2, 0 g) a 1540 °C (35 % O2, 1 g).
    var temperatura = Math.round(
      950 + (oxigeno - 15) * 22 + gravedad * 150
    );

    var forma;
    if (gravedad < 0.15) {
      forma = "Esférica — típica de microgravedad";
    } else if (gravedad < 0.6) {
      forma = "Redondeada / intermedia";
    } else {
      forma = "Alargada en forma de gota — gravedad terrestre";
    }

    // Régimen de color según la temperatura (ver comentario superior).
    var color;
    if (temperatura < 1080) {
      color = {
        nombre: "Rojo / naranja tenue",
        explicacion:
          "Hollín incandescente y combustión incompleta: llama tenue, con mucho hollín.",
      };
    } else if (temperatura < 1220) {
      color = {
        nombre: "Naranja",
        explicacion:
          "Hollín incandescente: llama luminosa típica, combustión todavía incompleta.",
      };
    } else if (temperatura < 1360) {
      color = {
        nombre: "Amarillo",
        explicacion:
          "Hollín muy caliente: llama brillante, empieza a quemar mejor.",
      };
    } else if (temperatura < 1480) {
      color = {
        nombre: "Amarillo-blanco, núcleo azul",
        explicacion:
          "Combustión casi completa: poco hollín y ya aparece el azul de CH* / C2* en el núcleo.",
      };
    } else {
      color = {
        nombre: "Azul-blanco",
        explicacion:
          "Combustión completa, casi sin hollín: domina el azul de la quimiluminiscencia (CH* / C2*).",
      };
    }

    return {
      gravedad: gravedad,
      oxigeno: oxigeno,
      tamano: tamano,
      diametroQuemador: diametro,
      factorEscala: factorEscala,
      radioQuemador: diametro / 2, // cm; el cilindro del quemador ya no depende del tamaño de la llama
      ancho: ancho, // cm
      altura: altura, // cm
      radioMax: ancho / 2,
      temperatura: temperatura,
      forma: forma,
      colorDominante: color.nombre,
      colorExplicacion: color.explicacion,
      baseZ: BASE_Z,
      // Exponente del perfil: desplaza el máximo grosor hacia
      // la base en gravedad terrestre y hacia el centro en 0 g.
      perfilExp: 0.75 + 0.45 * (1 - gravedad),
    };
  }

  // ---------- Utilidades ----------

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  // Generador pseudoaleatorio con semilla fija: la nube de puntos
  // no "salta" cada vez que se mueve un slider.
  function mulberry32(semilla) {
    return function () {
      semilla |= 0;
      semilla = (semilla + 0x6d2b79f5) | 0;
      var t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Radio de la llama a una altura normalizada u (0 = base, 1 = punta)
  function radioPerfil(u, p) {
    if (u <= 0 || u >= 1) return 0;
    var s = Math.sin(Math.PI * Math.pow(u, p.parametros.perfilExp));
    if (s <= 0) return 0;
    return p.parametros.radioMax * Math.pow(s, 0.65);
  }

  // Escala de color ÚNICA, en °C reales (600-1600 °C).
  // Al usar la temperatura en °C como valor de color (con cmin/cmax
  // fijos), una llama fría nunca llega al azul y una caliente sí:
  // el cambio de color con la temperatura se vuelve muy notorio.
  //   600-900 °C: rojo oscuro -> rojo
  //   900-1200 °C: naranja -> amarillo (hollín incandescente)
  //   1200-1450 °C: amarillo-blanco
  //   >1450 °C: azul-blanco (quimiluminiscencia, sin hollín)
  function escalaTemperatura() {
    return [
      [0, "#450a0a"],
      [0.15, "#7f1d1d"],
      [0.3, "#dc2626"],
      [0.45, "#ea580c"],
      [0.6, "#f59e0b"],
      [0.72, "#facc15"],
      [0.84, "#fef9c3"],
      [0.93, "#93c5fd"],
      [1, "#ffffff"],
    ];
  }

  // Temperatura local en °C en un punto de la llama:
  // máxima en el centro y en la base, menor en el borde y la punta.
  function tempLocal(p, u, frac, factorCapa) {
    var t =
      TEMP_MIN +
      (p.parametros.temperatura - TEMP_MIN) *
        (0.45 + 0.55 * (1 - frac * frac)) *
        (1 - 0.3 * u) *
        factorCapa;
    return clamp(t, TEMP_MIN, TEMP_MAX);
  }

  // ---------- Geometría ----------

  // Cilindro genérico (quemador y mecha) entre z0 y z1.
  function crearCilindro(r, z0, z1, color, opacidad, nombre) {
    var NT = 24;
    var x = [];
    var y = [];
    var z = [];
    for (var j = 0; j <= NT; j++) {
      var th = (j / NT) * 2 * Math.PI;
      x.push(r * Math.cos(th), r * Math.cos(th));
      y.push(r * Math.sin(th), r * Math.sin(th));
      z.push(z1, z0);
    }
    x.push(0, 0);
    y.push(0, 0);
    z.push(z1, z0);
    var centroSup = x.length - 2;
    var centroInf = x.length - 1;

    var ii = [];
    var jj = [];
    var kk = [];
    for (var k = 0; k < NT; k++) {
      var sup0 = 2 * k;
      var inf0 = 2 * k + 1;
      var sup1 = 2 * k + 2;
      var inf1 = 2 * k + 3;
      ii.push(sup0, inf0, centroSup, centroInf);
      jj.push(inf0, inf1, sup0, inf1);
      kk.push(sup1, sup1, sup1, inf0);
    }

    return {
      type: "mesh3d",
      x: x,
      y: y,
      z: z,
      i: ii,
      j: jj,
      k: kk,
      color: color,
      opacity: opacidad,
      flatshading: true,
      hoverinfo: "skip",
      showscale: false,
      name: nombre,
    };
  }

  // Una capa (superficie) de la llama, escalada respecto a la exterior.
  // factorCapa: 0,75 (exterior) / 0,9 (media) / 1,0 (interior):
  // la capa interior está más caliente, así que llega más lejos
  // en la escala de color.
  function crearCapa(escala, opacidad, factorCapa, p) {
    var NU = 42; // divisiones a lo largo de la altura
    var NT = 32; // divisiones alrededor
    var x = [];
    var y = [];
    var z = [];
    var tempC = [];

    for (var i = 0; i <= NU; i++) {
      var u = i / NU;
      var zz = p.parametros.baseZ + u * p.parametros.altura;
      var rBase = radioPerfil(u, { parametros: p.parametros });
      for (var j = 0; j <= NT; j++) {
        var theta = (j / NT) * 2 * Math.PI;
        var turb =
          1 +
          0.05 * Math.sin(3 * theta + 8 * u) * (0.3 + 0.7 * p.parametros.gravedad) +
          0.03 * Math.sin(7 * theta - 5 * u);
        var r = rBase * escala * turb;
        var dx = 0.1 * p.parametros.radioMax * u * u * p.parametros.gravedad;
        x.push(r * Math.cos(theta) + dx);
        y.push(r * Math.sin(theta));
        z.push(zz);
        // En la superficie frac ~ 1 (borde), así que es la zona
        // más fría de la llama a esa altura.
        tempC.push(tempLocal(p, u, 1, factorCapa));
      }
    }

    var ii = [];
    var jj = [];
    var kk = [];
    for (var a = 0; a < NU; a++) {
      for (var b = 0; b < NT; b++) {
        var v0 = a * (NT + 1) + b;
        var v1 = v0 + NT + 1;
        var v2 = v1 + 1;
        var v3 = v0 + 1;
        ii.push(v0, v1);
        jj.push(v1, v2);
        kk.push(v3, v3);
      }
    }

    return {
      type: "mesh3d",
      x: x,
      y: y,
      z: z,
      i: ii,
      j: jj,
      k: kk,
      intensity: tempC,
      cmin: TEMP_MIN,
      cmax: TEMP_MAX,
      colorscale: escalaTemperatura(),
      opacity: opacidad,
      flatshading: false,
      lighting: { ambient: 0.7, diffuse: 0.6, specular: 0.4, roughness: 0.6 },
      lightposition: { x: 100, y: 200, z: 1000 },
      hoverinfo: "skip",
      showscale: false,
      name: "Llama",
    };
  }

  // Nube de puntos dentro del volumen de la llama.
  function crearVolumen(p) {
    var rand = mulberry32(20261114);
    var N = 2200;
    var x = [];
    var y = [];
    var z = [];
    var temp = [];

    for (var n = 0; n < N; n++) {
      var u = Math.pow(rand(), 1.3);
      var theta = rand() * 2 * Math.PI;
      var frac = Math.sqrt(rand()); // 0 = centro, 1 = borde
      var rBase = radioPerfil(u, { parametros: p.parametros });
      var r = rBase * frac;
      var dx = 0.1 * p.parametros.radioMax * u * u * p.parametros.gravedad;
      x.push(r * Math.cos(theta) + dx);
      y.push(r * Math.sin(theta));
      z.push(p.parametros.baseZ + u * p.parametros.altura);
      temp.push(tempLocal(p, u, frac, 1));
    }

    return {
      type: "scatter3d",
      mode: "markers",
      x: x,
      y: y,
      z: z,
      marker: {
        size: 3,
        color: temp,
        cmin: TEMP_MIN,
        cmax: TEMP_MAX,
        colorscale: escalaTemperatura(),
        opacity: 0.8,
        line: { width: 0 },
        colorbar: { title: "Temperatura (°C)", thickness: 12 },
      },
      hoverinfo: "skip",
      name: "Volumen caliente",
    };
  }

  // ---------- Dibujo ----------

  function leerParametros() {
    var elQuemador = document.getElementById("diametro-quemador");
    return calcularParametros(
      parseFloat(document.getElementById("gravedad").value),
      parseFloat(document.getElementById("oxigeno").value),
      parseFloat(document.getElementById("tamano").value),
      elQuemador ? parseFloat(elQuemador.value) : QUEMADOR_REF_CM
    );
  }

  function actualizarInfo(p) {
    var set = function (id, texto) {
      var el = document.getElementById(id);
      if (el) el.textContent = texto;
    };
    set("gravedad-valor", p.gravedad.toFixed(2) + " g");
    set("oxigeno-valor", p.oxigeno + " %");
    set("tamano-valor", String(p.tamano));
    set("diametro-valor", p.diametroQuemador.toFixed(1) + " cm");
    set(
      "info-quemador",
      "Ø " + p.diametroQuemador.toFixed(1) + " cm — las medidas en cm se escalan ×" +
        p.factorEscala.toFixed(2) + " respecto a la referencia de 0,6 cm"
    );
    set("info-altura", p.altura.toFixed(1) + " cm (aprox.)");
    set("info-ancho", p.ancho.toFixed(1) + " cm (aprox.)");
    set("info-temperatura", p.temperatura + " °C aprox.");
    set("info-forma", p.forma);
    set("info-color", p.colorDominante);
    set("info-color-explicacion", p.colorExplicacion);
    set(
      "info-oxigeno",
      p.oxigeno < 18
        ? "Combustión pobre: llama tenue y anaranjada."
        : p.oxigeno > 28
          ? "Combustión intensa: núcleo más azulado y brillante."
          : "Combustión estable."
    );
  }

  function dibujar() {
    var p = leerParametros();
    actualizarInfo(p);

    // Quemador con el diámetro que puso el usuario (antes su tamaño
    // dependía del de la llama) y mecha fina proporcional a él.
    // La llama sigue naciendo 0,4 cm por encima: el cilindro no la tapa.
    var radioQuemador = p.radioQuemador;
    var radioMecha = Math.max(0.03, radioQuemador * 0.2);
    var datos = [
      crearCapa(1.0, 0.28, 0.75, { parametros: p }),
      crearCapa(0.68, 0.4, 0.9, { parametros: p }),
      crearCapa(0.4, 0.55, 1.0, { parametros: p }),
      crearVolumen({ parametros: p }),
      crearCilindro(radioMecha, 0, p.baseZ, "#1e293b", 0.95, "Mecha"),
      crearCilindro(radioQuemador, -0.4, 0, "#475569", 0.95, "Quemador"),
    ];

    var rango = Math.max(p.altura, p.ancho) * 0.65 + 0.5;
    var layout = {
      title: { text: "Llama 3D — " + p.forma, font: { color: "#f8fafc", size: 15 } },
      paper_bgcolor: "#0f172a",
      font: { color: "#e2e8f0" },
      margin: { l: 0, r: 0, t: 40, b: 0 },
      showlegend: false,
      scene: {
        bgcolor: "#0f172a",
        xaxis: {
          title: "X (cm)",
          range: [-rango, rango],
          color: "#94a3b8",
          gridcolor: "#1e293b",
          zerolinecolor: "#334155",
        },
        yaxis: {
          title: "Y (cm)",
          range: [-rango, rango],
          color: "#94a3b8",
          gridcolor: "#1e293b",
          zerolinecolor: "#334155",
        },
        zaxis: {
          title: "Altura (cm)",
          range: [-1.0, p.baseZ + p.altura + 1.2],
          color: "#94a3b8",
          gridcolor: "#1e293b",
          zerolinecolor: "#334155",
        },
        aspectmode: "manual",
        aspectratio: { x: 1, y: 1, z: 1.3 },
        camera: { eye: { x: 1.7, y: 1.7, z: 0.9 } },
      },
    };

    var config = { responsive: true, displaylogo: false };

    if (window.__llamaDibujada) {
      Plotly.react(GRAFICA_ID, datos, layout, config);
    } else {
      Plotly.newPlot(GRAFICA_ID, datos, layout, config);
      window.__llamaDibujada = true;
    }
  }

  function init() {
    var ids = ["gravedad", "oxigeno", "tamano", "diametro-quemador"];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("input", dibujar);
    });
    dibujar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
