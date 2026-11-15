/* FireSpace — Simulación 3D de una llama con Plotly
 *
 * Modelo ilustrativo (no es un cálculo físico riguroso):
 *  - Gravedad:  en 1 g la llama es alargada, en forma de gota.
 *               en 0 g (microgravedad) tiende a ser esférica, como
 *               se observa en los experimentos de combustión en la ISS.
 *  - Oxígeno:   más O2 -> llama más grande y más caliente.
 *               Menos O2 -> más pequeña y menos caliente.
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
 *     516 nm). Domina cuando el combustible forma poco hollín
 *     (por ejemplo, el metanol de FLEX: "very dim blue flame").
 *   Por eso aquí el color NO sale de una lista de estados: el del hollín
 *   se calcula con la ley de Planck (cuerpo negro) y las funciones de
 *   color CIE 1931 para la temperatura de cada punto, y el azul es el de
 *   la emisión de CH* (431 nm), pesado por lo poco o mucho hollín que
 *   forma el combustible (ver "Color físico de la llama" más abajo).
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
  var QUEMADOR_REF_CM = 0.6;
  var HOLLIN_GENERICO = 0.6; // hidrocarburo genérico (sin compuesto elegido): llama con hollín // diámetro de referencia de la escala (cm)
  var QUEMADOR_MIN_CM = 0.2;
  var QUEMADOR_MAX_CM = 2.0;

  // ---------- Parámetros físicos (ilustrativos) ----------

  function calcularParametros(gravedad, oxigeno, tamano, diametroQuemador, mezcla) {
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

    // Combustible: si el usuario eligió compuestos de PSI-68 (FLEX-2) se usa su
    // tendencia relativa a formar hollín; si no, un hidrocarburo genérico.
    mezcla = mezcla || { hollin: HOLLIN_GENERICO, nombre: "Hidrocarburo genérico" };

    // Color: se CALCULA (ley de Planck + CIE 1931), no se elige de una lista de estados.
    var color = describirColor(temperatura, mezcla.hollin);

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
      hollin: mezcla.hollin,
      combustible: mezcla.nombre,
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

  // ---------- Color físico de la llama ----------
  //
  // Lo que se ve en una llama tiene dos orígenes (ver exp_flex.txt: el metanol
  // "burns with a very dim blue flame (not much soot production)"):
  //  1. Hollín incandescente: emite como un cuerpo negro. Su color se calcula
  //     con la ley de Planck integrada con las funciones de igualación de color
  //     CIE 1931 (ajuste analítico de Wyman, Sloan y Shirley, 2013) y se pasa a
  //     sRGB. No hay una tabla de colores inventada: cada temperatura da su color.
  //  2. Quimiluminiscencia de CH* (~431 nm) y C2* (~516 nm): el azul de la zona
  //     de reacción, visible cuando hay poco hollín. Su color sale de esas longitudes de onda.
  // El brillo de un cuerpo negro crece muchísimo con T; para poder mostrarlo se
  // usa "exposición automática" (como una cámara) respecto a la zona más caliente
  // y una compresión de brillo. Eso cambia el brillo en pantalla, no el tono.
  var C2 = 1.4388e-2; // segunda constante de radiación (m·K)
  var PUNTO_DRAPER_C = 525; // °C: por debajo, un sólido caliente casi no emite luz visible

  function lobulo(l, mu, s1, s2) {
    var t = (l - mu) / (l < mu ? s1 : s2);
    return Math.exp(-0.5 * t * t);
  }
  function cmf(l) { // CIE 1931 2°, ajuste de Wyman et al. (2013)
    return [
      1.056 * lobulo(l, 599.8, 37.9, 31.0) + 0.362 * lobulo(l, 442.0, 16.0, 26.7) - 0.065 * lobulo(l, 501.1, 20.4, 26.2),
      0.821 * lobulo(l, 568.8, 46.9, 40.5) + 0.286 * lobulo(l, 530.9, 16.3, 31.1),
      1.217 * lobulo(l, 437.0, 11.8, 36.0) + 0.681 * lobulo(l, 459.0, 26.0, 13.8),
    ];
  }
  function xyzALineal(X, Y, Z) { // XYZ -> sRGB lineal (D65)
    return [
      Math.max(0, 3.2406 * X - 1.5372 * Y - 0.4986 * Z),
      Math.max(0, -0.9689 * X + 1.8758 * Y + 0.0415 * Z),
      Math.max(0, 0.0557 * X - 0.204 * Y + 1.057 * Z),
    ];
  }
  function gammaSRGB(v) {
    v = clamp(v, 0, 1);
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  }

  // Cuerpo negro a T (°C): color lineal con luminancia Y = 1 y luminancia relativa.
  var cacheCuerpoNegro = {};
  function cuerpoNegro(tC) {
    var clave = Math.round(tC / 5) * 5;
    if (cacheCuerpoNegro[clave]) return cacheCuerpoNegro[clave];
    var T = clave + 273.15, X = 0, Y = 0, Z = 0;
    for (var l = 380; l <= 780; l += 5) {
      var lm = l * 1e-9;
      var B = 1 / (Math.pow(lm, 5) * (Math.exp(C2 / (lm * T)) - 1)); // Planck (sin constantes)
      var c = cmf(l);
      X += B * c[0]; Y += B * c[1]; Z += B * c[2];
    }
    return (cacheCuerpoNegro[clave] = { rgb: cromaticidad(xyzALineal(X, Y, Z)), Y: Y });
  }

  // Normaliza un color lineal para que su canal mayor valga 1 (solo el tono).
  function cromaticidad(rgb) {
    var m = Math.max(rgb[0], rgb[1], rgb[2]) || 1;
    return [rgb[0] / m, rgb[1] / m, rgb[2] / m];
  }

  // Tono de la zona de reacción: emisión de CH* (431 nm) + C2* (banda de Swan,
  // 516 nm). La proporción real varía con el combustible; aquí C2* pesa la mitad
  // que CH* (aproximación), lo que da el azul típico de una llama sin hollín.
  var AZUL_CH = (function () {
    var ch = cmf(431), c2 = cmf(516);
    return cromaticidad(xyzALineal(ch[0] + 0.5 * c2[0], ch[1] + 0.5 * c2[1], ch[2] + 0.5 * c2[2]));
  })();

  // Color en pantalla de un punto de la llama.
  //  tC: temperatura local; hollinLocal: 0 (sin hollín) a 1; tRef: temperatura de la zona más caliente.
  function colorLlama(tC, hollinLocal, tRef) {
    var rgb = [0, 0, 0];
    // Opacidad del hollín: con un poco de hollín su brillo ya domina sobre el de CH*/C2*.
    var hollinVisible = 1 - Math.exp(-4 * hollinLocal);
    if (tC > PUNTO_DRAPER_C) {
      var cn = cuerpoNegro(tC);
      var brillo = Math.pow(cn.Y / cuerpoNegro(tRef).Y, 0.22); // exposición automática + compresión
      for (var k = 0; k < 3; k++) rgb[k] += hollinVisible * cn.rgb[k] * brillo * 2.2;
    }
    // CH*/C2*: tenue, solo se ve donde no hay hollín (por eso las llamas con hollín se ven amarillas)
    var azul = (1 - hollinVisible) * 0.9 * clamp((tC - PUNTO_DRAPER_C) / 500, 0, 1);
    for (var j = 0; j < 3; j++) rgb[j] += AZUL_CH[j] * azul;
    var r = Math.round(255 * gammaSRGB(1 - Math.exp(-rgb[0])));
    var g = Math.round(255 * gammaSRGB(1 - Math.exp(-rgb[1])));
    var b = Math.round(255 * gammaSRGB(1 - Math.exp(-rgb[2])));
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  // Hollín a lo largo de la llama: la base (zona de reacción) casi sin hollín y
  // azul; el hollín aparece aguas arriba en la llama. hollin = valor del combustible.
  function hollinLocal(p, u, frac) {
    var h = p.parametros.hollin * clamp((u - 0.08) / 0.35, 0, 1);
    return clamp(h * (0.7 + 0.3 * (1 - frac)), 0, 1);
  }

  // Nombre del color dominante, leído del color calculado en la zona más caliente.
  function describirColor(tMax, hollin) {
    var cn = cuerpoNegro(tMax);
    var rel = cn.rgb[1] / cn.rgb[0]; // verde/rojo del tono de cuerpo negro: más alto = más amarillo
    var tono = rel < 0.12 ? "rojo" : rel < 0.22 ? "naranja rojizo" : rel < 0.32 ? "naranja" : "amarillo anaranjado";
    if (hollin < 0.2) {
      return {
        nombre: "Azul tenue",
        explicacion: "Casi sin hollín: domina la emisión azul de CH* de la zona de reacción, como la llama de metanol descrita en FLEX. El hollín que hay brillaría " + tono + " a " + tMax + " °C.",
      };
    }
    return {
      nombre: (hollin < 0.5 ? "Base azul y cuerpo " : "") + tono + (hollin >= 0.5 ? " luminoso con base azul" : ""),
      explicacion: "Color de cuerpo negro del hollín a " + tMax + " °C (ley de Planck, CIE 1931). La base se ve azul por la emisión de CH* donde aún no hay hollín.",
    };
  }

  // Escala de la barra lateral: los mismos colores del hollín, en el rango de la llama actual.
  function escalaTemperatura(tMin, tMax, tRef) {
    var pasos = 12, escala = [];
    for (var i = 0; i <= pasos; i++) {
      var t = tMin + ((tMax - tMin) * i) / pasos;
      escala.push([i / pasos, colorLlama(t, 1, tRef)]);
    }
    return escala;
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
        tempC.push(colorLlama(tempLocal(p, u, 1, factorCapa), hollinLocal(p, u, 1), p.parametros.temperatura));
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
      vertexcolor: tempC, // color calculado en cada vértice (Planck + CH*)
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
      temp.push(colorLlama(tempLocal(p, u, frac, 1), hollinLocal(p, u, frac), p.parametros.temperatura));
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
        opacity: 0.8,
        line: { width: 0 },
      },
      hoverinfo: "skip",
      name: "Volumen caliente",
    };
  }

  // Barra de temperatura: rango real de la llama dibujada (mín. del borde - máx.)
  // con los mismos colores del hollín. Cambia con cada slider.
  function crearBarraTemperatura(p) {
    var tMin = Math.round(tempLocal({ parametros: p }, 1, 1, 0.75));
    var tMax = p.temperatura;
    return {
      type: "scatter3d",
      mode: "markers",
      x: [0], y: [0], z: [p.baseZ],
      marker: {
        size: 0.1,
        opacity: 0,
        color: [tMax],
        cmin: tMin,
        cmax: tMax,
        colorscale: escalaTemperatura(tMin, tMax, tMax),
        showscale: true,
        colorbar: {
          title: { text: "Temperatura (°C)<br><sub>máx. " + tMax + " °C</sub>", side: "right" },
          thickness: 12, len: 0.45, x: 0.98, xanchor: "right", y: 0.04, yanchor: "bottom",
          tickfont: { color: "#e5e5e5" },
        },
      },
      hoverinfo: "skip",
      name: "Escala",
    };
  }

  // ---------- Dibujo ----------

  // Compuestos de PSI-68 (FLEX-2): deslizadores con data-hollin y data-nombre.
  // Devuelve null si no hay ninguno activo (se usa el hidrocarburo genérico).
  function leerMezcla() {
    var total = 0, hollin = 0, nombres = [];
    document.querySelectorAll("input[data-compuesto]").forEach(function (el) {
      var v = parseFloat(el.value) || 0;
      if (v <= 0) return;
      total += v;
      hollin += v * parseFloat(el.dataset.hollin);
      nombres.push(el.dataset.nombre + " " + Math.round(v * 100) + " %");
    });
    if (total <= 0) return null;
    return { hollin: hollin / total, nombre: nombres.join(" + ") };
  }

  function leerParametros() {
    var elQuemador = document.getElementById("diametro-quemador");
    return calcularParametros(
      parseFloat(document.getElementById("gravedad").value),
      parseFloat(document.getElementById("oxigeno").value),
      parseFloat(document.getElementById("tamano").value),
      elQuemador ? parseFloat(elQuemador.value) : QUEMADOR_REF_CM,
      leerMezcla()
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
    set("info-combustible", p.combustible + " (hollín relativo " + p.hollin.toFixed(2) + ")");
    set(
      "info-oxigeno",
      p.oxigeno < 18
        ? "Oxígeno bajo: en este modelo la llama es más pequeña y menos caliente."
        : p.oxigeno > 28
          ? "Oxígeno alto: en este modelo la llama es más grande y más caliente."
          : "Oxígeno cercano al del aire (21 %)."
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
      crearBarraTemperatura(p),
      crearCilindro(radioMecha, 0, p.baseZ, "#1e293b", 0.95, "Mecha"),
      crearCilindro(radioQuemador, -0.4, 0, "#475569", 0.95, "Quemador"),
    ];

    var rango = Math.max(p.altura, p.ancho) * 0.65 + 0.5;
    // Estilo visual de FireSpace GX (visor gris tipo editor 3D). Sólo colores y márgenes.
    var ejeVisor = {
      color: "#b5b5b5",
      gridcolor: "#565656",
      zerolinecolor: "#7fbf2a",
      backgroundcolor: "#3b3b3b",
      showbackground: true,
      showspikes: false, // sin las líneas guía blancas al pasar el ratón
    };
    var layout = {
      paper_bgcolor: "#3b3b3b",
      font: { color: "#e5e5e5", family: "Inter, system-ui, sans-serif" },
      margin: { l: 0, r: 0, t: 0, b: 0 },
      showlegend: false,
      hovermode: false,
      uirevision: "llama", // conserva el giro/zoom del usuario al mover los sliders
      scene: {
        hovermode: false,
        bgcolor: "#3b3b3b",
        xaxis: Object.assign({ title: "X (cm)", range: [-rango, rango] }, ejeVisor),
        yaxis: Object.assign({ title: "Y (cm)", range: [-rango, rango] }, ejeVisor),
        zaxis: Object.assign({ title: "Altura (cm)", range: [-1.0, p.baseZ + p.altura + 1.2] }, ejeVisor),
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
    window.__ultimaLlama = p;
    window.dispatchEvent(new CustomEvent("fsgx:llama", { detail: p }));
  }

  function init() {
    var ids = ["gravedad", "oxigeno", "tamano", "diametro-quemador"];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("input", dibujar);
    });
    document.querySelectorAll("input[data-compuesto]").forEach(function (el) {
      el.addEventListener("input", dibujar);
    });
    dibujar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
