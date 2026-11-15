import os
import re
import time
from collections import Counter

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from openai import OpenAI

import biblioteca

load_dotenv(override=True)  # el .env siempre manda, aunque la terminal tenga valores viejos

app = Flask(__name__)

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
    timeout=45,       # segundos máximos de espera por consulta
    max_retries=0,    # sin reintentos ocultos: si falla, se avisa de inmediato
)

# ---------- CONFIGURACIÓN DEL ASISTENTE ----------

# Modelo de IA: se puede cambiar en el archivo .env con la línea MODELO_IA=...
MODELO = os.getenv("MODELO_IA", "openrouter/free")
MAX_CARACTERES_PREGUNTA = 800
FRAGMENTOS_POR_PREGUNTA = 6
MAX_TOKENS_CLASIFICAR = 300     # margen suficiente incluso para modelos que "piensan" antes de responder
MAX_TOKENS_RESPUESTA = 1000

# Memoria de la conversación: el navegador envía solo el intercambio anterior
# (la pregunta anterior y su respuesta), para entender preguntas como "¿y eso por qué?".
MAX_MENSAJES_HISTORIAL = 2        # 1 pregunta + 1 respuesta
MAX_CARACTERES_POR_MENSAJE = 700
PALABRAS_PREGUNTA_CORTA = 8       # preguntas así de cortas suelen depender de la anterior ("¿y eso por qué?")

# Razonamiento interno del modelo ("pensar" antes de responder). "none" lo desactiva:
# respuestas más rápidas y sin el riesgo de que el modelo gaste todos sus tokens pensando.
# Se puede cambiar en el .env con RAZONAMIENTO_IA=low (o medium). Con "modelo" no se envía el ajuste.
RAZONAMIENTO = os.getenv("RAZONAMIENTO_IA", "none").strip().lower()
enviar_ajuste_razonamiento = RAZONAMIENTO not in ("", "modelo")

# Modo ahorro: con CLASIFICAR_CON_IA=no en el .env, cada pregunta usa 1 consulta a la IA en vez de 2.
# Los saludos se detectan con patrones y la búsqueda usa solo el glosario de biblioteca.py.
CLASIFICAR_CON_IA = os.getenv("CLASIFICAR_CON_IA", "si").strip().lower() not in ("no", "false", "0")

PATRON_CONVERSACION = re.compile(
    r"^(hola|buen[oa]s|gracias|muchas gracias|hey|saludos|que tal)\b"
    r"|quien eres|que eres|hablame de ti|presentate"
    r"|que (puedes|sabes) hacer|de que (temas )?(puedes|sabes) hablar|sobre que (temas )?(puedes|sabes)"
    r"|de donde (obtienes|sacas|viene)|tus fuentes|como funcionas"
    r"|eres (de la |un producto (oficial )?de la )?nasa|puedes (buscar|navegar) (en )?internet"
    r"|que (te )?puedo preguntar|preguntarte|ayudarme|en que me (puedes )?ayudar"
    r"|quien te (creo|hizo|desarrollo|programo)|quienes te|tus creadores"
    r"|chatgpt|gemini|otras? ia|otros? asistentes?|diferencia entre tu"
    r"|tu tema|de que trata (esto|firespace|la pagina)|que es firespace"
)

PERSONALIDAD = """Personalidad del asistente de FireSpace:
- Eres cálido, cercano y entusiasta, como un amigo al que le apasiona el espacio y le encanta contagiar esa curiosidad. Siempre eres respetuoso y nunca te burlas de nadie.
- Por defecto hablas sencillo, para que cualquier persona te entienda sin saber de ciencia: frases cortas, palabras de todos los días, comparaciones con cosas cotidianas, y cada término técnico lo explicas en pocas palabras la primera vez que lo usas.
- Solo te pones técnico si la persona escribe con lenguaje técnico o dice que es estudiante, investigador o ingeniero del tema.
- Adapta tu tono al de la persona: si escribe casual, con risas o expresiones mexicanas, respóndele con ese mismo tono relajado; si escribe formal, responde formal.
- Puedes usar algún emoji de vez en cuando (por ejemplo 🔥, 🚀, 😮), sin exagerar y nunca en respuestas técnicas.
- Tu tema es la combustión en el espacio y la seguridad contra incendios en la exploración espacial; siempre llevas la conversación de vuelta a eso con naturalidad."""

PROMPT_CLASIFICAR = (
    "Analiza el mensaje del usuario.\n"
    "- Si es conversación cotidiana (saludos, agradecimientos, cómo estás), una reacción o expresión "
    "(sorpresa, risa, asombro, como \"wow\", \"jajaja\", \"alatorre\", \"no manches\") o una pregunta sobre "
    "el asistente, FireSpace o sus fuentes (quién eres, qué puedes hacer, de qué temas hablas, "
    "cómo funcionas, de dónde sacas tu información), responde exactamente: META\n"
    "- En cualquier otro caso, conviértelo en entre 5 y 10 palabras clave en inglés para buscar "
    "en documentos técnicos de NASA sobre combustión. Incluye sinónimos técnicos y nombres de "
    "experimentos si se mencionan. Si la pregunta es amplia (por ejemplo, datos curiosos), "
    "elige términos generales y variados del tema. Si se incluye una pregunta anterior, úsala solo para "
    "entender a qué se refiere el mensaje actual (por ejemplo, \"eso\" o \"ese experimento\"). "
    "Responde SOLO con las palabras separadas por espacios."
)

PROMPT_RESPUESTA = PERSONALIDAD + """

Respondes con base en los fragmentos numerados de fuentes oficiales de NASA que se te entregan.
Reglas obligatorias:
1. Todo dato concreto (cifras, resultados, condiciones de prueba, nombres y objetivos de experimentos, fechas, hechos históricos y conclusiones de NASA) debe venir de los fragmentos y llevar su cita entre corchetes, por ejemplo [2] o [1][3].
2. Puedes usar conocimiento científico general para explicar conceptos básicos, conectar ideas, comparar, razonar o proponer, como lo haría un buen profesor. Esas partes no llevan cita y deben presentarse como explicación o razonamiento, nunca como un resultado de NASA.
3. Nunca inventes datos, cifras, resultados, fechas, autores, publicaciones ni enlaces. Si la pregunta pide un dato que no aparece en los fragmentos, dilo con naturalidad, por ejemplo: "No tengo información sobre...".
4. Si la pregunta parte de una idea incorrecta, corrígela con base en las fuentes.
5. Sigue la personalidad descrita arriba: por defecto, explica de forma amigable y sencilla para cualquier persona; si la pregunta es técnica, responde con la precisión que esperaría un investigador o ingeniero aeroespacial. Ve al grano: la extensión debe ser proporcional a la pregunta, y una pregunta sencilla merece una respuesta corta.
6. Responde en español; los fragmentos están en inglés: tradúcelos con fidelidad.
7. Escribe como si explicaras directamente, con tus propias palabras. Nunca menciones de dónde sacas la información con frases como "las fuentes", "los fragmentos", "los documentos", "el texto" o "la información proporcionada": las citas entre corchetes ya indican el origen y el usuario no sabe qué documentos recibiste. Escribe en texto plano, sin Markdown (nada de asteriscos ni almohadillas); para listas usa guiones.
8. Puede haber mensajes anteriores de la conversación. Úsalos solo para entender a qué se refiere la pregunta actual (por ejemplo, "eso" o "ese experimento"). Los datos y las citas deben salir únicamente de los fragmentos de esta pregunta."""

PROMPT_META = PERSONALIDAD + """

Ahora estás conversando. Responde de forma natural y breve, exactamente a lo que la persona dice o pregunta.
Reglas:
1. Para hablar de ti, de FireSpace o de tus fuentes, usa SOLO la información de la FICHA. No inventes capacidades, fuentes ni datos.
2. Si es un saludo, un agradecimiento o charla cotidiana, responde brevemente y con amabilidad, e invita a preguntar sobre combustión en el espacio con un ejemplo.
2b. Si es una reacción o expresión (sorpresa, risa, asombro, como "alatorre", "no manches", "wow" o "jajaja"), reacciona con la misma energía y conéctala con lo último que hablaron: puedes retomar con tus palabras algo de tu respuesta anterior o invitar a seguir con una pregunta relacionada. Si no hay conversación previa, reacciona con simpatía y pregunta qué le sorprendió. Nunca trates una expresión como si fuera un nombre o una palabra desconocida.
3. Si te piden explicar tu tema de forma sencilla (por ejemplo, a un niño), descríbelo con palabras simples usando solo lo que dice la FICHA, sin agregar datos científicos.
4. Si preguntan algo ajeno a FireSpace y a la combustión en el espacio, explica con amabilidad que no es tu tema y sugiere dos o tres preguntas que sí puedes responder.
5. No agregues aquí datos científicos nuevos (solo puedes retomar lo que ya dijiste en la conversación). Si te hacen una pregunta científica, invita a la persona a hacerla directamente para responderle con fuentes. Si el mensaje parece continuar la conversación anterior pero no tienes información para responderlo, pide amablemente que lo explique un poco más.
6. Responde en español, en texto plano, sin formato Markdown.

FICHA:
{ficha}"""

DESCRIPCION_FUENTES = {
    "PSI": "investigaciones del repositorio PSI (Physical Sciences Informatics) de NASA, que publica "
           "los datos de experimentos de combustión hechos en la Estación Espacial Internacional y en tierra",
    "NASA Combustion Science": "documentos (fichas de experimentos y páginas) enlazados desde la página "
                               "NASA Combustion Science del Glenn Research Center",
}

MENSAJE_LIMITE = (
    "Se alcanzó el límite de consultas gratuitas a la IA por hoy. "
    "Intenta más tarde o avisa al equipo de FireSpace."
)

MENSAJE_SIN_INFORMACION = (
    "No encontré información sobre esto en la biblioteca de FireSpace, que solo contiene "
    "fuentes oficiales de NASA del reto. Prueba preguntando sobre combustión en microgravedad, "
    "los experimentos de la ISS o la seguridad contra incendios en naves espaciales."
)

NOTA_SIN_CITAS = (
    "\n\nNota: esta respuesta no cita ninguna fuente de la biblioteca de FireSpace; "
    "tómala como una explicación general."
)


# ---------- FUNCIONES DEL ASISTENTE ----------

def generar(mensajes, temperatura, max_tokens):
    """Llama al modelo de IA y devuelve (texto, nombre_del_modelo)."""
    global enviar_ajuste_razonamiento
    parametros = dict(model=MODELO, messages=mensajes, temperature=temperatura, max_tokens=max_tokens)
    inicio = time.perf_counter()

    if enviar_ajuste_razonamiento:
        ajuste = {"effort": RAZONAMIENTO}
        if RAZONAMIENTO != "none":
            ajuste["exclude"] = True  # que piense, pero sin devolver su razonamiento
        try:
            r = client.chat.completions.create(**parametros, extra_body={"reasoning": ajuste})
        except Exception as e:
            if "BadRequest" not in type(e).__name__:
                raise
            # Este modelo no acepta el ajuste: se reintenta sin él y no se vuelve a enviar.
            print(f"[IA] El modelo no acepta ajustar el razonamiento ({e}); se reintenta sin el ajuste", flush=True)
            enviar_ajuste_razonamiento = False
            r = client.chat.completions.create(**parametros)
    else:
        r = client.chat.completions.create(**parametros)

    eleccion = r.choices[0]
    texto = (eleccion.message.content or "").strip()
    print(f"[IA] {r.model} respondió en {time.perf_counter() - inicio:.1f} s "
          f"({len(texto)} caracteres, motivo de fin: {eleccion.finish_reason})", flush=True)
    return texto, r.model


def limpiar_historial(crudo):
    """Convierte el historial que manda el navegador en mensajes seguros para la IA.
    Solo acepta los roles esperados, recorta el texto y quita las citas viejas [n],
    porque esos números se referían a las fuentes de preguntas anteriores."""
    if not isinstance(crudo, list):
        return []
    mensajes = []
    for item in crudo[-MAX_MENSAJES_HISTORIAL:]:
        if not isinstance(item, dict):
            continue
        rol = item.get("rol")
        texto = str(item.get("texto", "")).strip()
        if rol not in ("usuario", "asistente") or not texto:
            continue
        texto = re.sub(r"\[\d+(?:\s*,\s*\d+)*\]", "", texto)
        texto = texto.replace(NOTA_SIN_CITAS.strip(), "").strip()
        mensajes.append({
            "role": "user" if rol == "usuario" else "assistant",
            "content": texto[:MAX_CARACTERES_POR_MENSAJE],
        })
    return mensajes


def ultima_pregunta(historial):
    for mensaje in reversed(historial):
        if mensaje["role"] == "user":
            return mensaje["content"]
    return ""


class LimiteDeUso(Exception):
    """Se agotaron las consultas permitidas por el proveedor de IA."""


def avisar_limite(error):
    """Muestra en la terminal el motivo exacto que dio OpenRouter."""
    print(f"[FireSpace] Límite de uso de la IA alcanzado. Detalle: {error}", flush=True)


def es_limite_de_uso(error):
    return "RateLimit" in type(error).__name__ or "429" in str(error)


# Reacciones y expresiones cortas: van directo a la conversación, sin buscar en la biblioteca.
PATRON_REACCION = re.compile(
    r"^(ja(ja)*|je(je)*|ji(ji)*|xd+|lol|wow+|guau+|alatorre+|no manches|no mames|orale|chale|"
    r"que padre|que chido|que locura|que loco|increible|impresionante|genial|cool|"
    r"neta|en serio|a poco|ok|okay|va|sale|vale|ya veo|interesante|nombre|uff+|o+h+|a+h+)\b"
)


def clasificar_sin_ia(pregunta):
    """Modo ahorro: detecta la conversación con patrones; la búsqueda usará el glosario."""
    texto = biblioteca.sin_acentos(pregunta.lower()).strip(" ¿?¡!.,")
    if PATRON_CONVERSACION.search(texto):
        return "META", ""
    if len(texto.split()) <= 4 and PATRON_REACCION.search(texto):
        return "META", ""
    return "BIBLIOTECA", ""


def clasificar(pregunta, anterior=""):
    """Devuelve ("META", "") si el mensaje es sobre el asistente,
    o ("BIBLIOTECA", palabras_clave_en_ingles) si es una pregunta para buscar en las fuentes."""
    try:
        texto, _ = generar(
            [{"role": "system", "content": PROMPT_CLASIFICAR},
             {"role": "user", "content": (f"Pregunta anterior (solo contexto): {anterior}\n"
                                          f"Mensaje actual: {pregunta}") if anterior else pregunta}],
            temperatura=0,
            max_tokens=MAX_TOKENS_CLASIFICAR,
        )
    except Exception as e:
        if es_limite_de_uso(e):
            avisar_limite(e)
            raise LimiteDeUso() from e
        app.logger.exception("No se pudo clasificar la pregunta")
        return "BIBLIOTECA", ""  # si falla, se busca solo con la pregunta original
    if texto.strip().upper().startswith("META"):
        return "META", ""
    if not texto.strip():
        print("[FireSpace] La IA no devolvió palabras clave; se usa el glosario de respaldo", flush=True)
    return "BIBLIOTECA", texto


def siglas_de_experimentos(documentos):
    """Siglas que aparecen entre paréntesis en los títulos, ej. "(FLEX)" -> FLEX."""
    siglas = set()
    for _, titulo in documentos:
        for sigla in re.findall(r"\(([A-Z][^)]*)\)", titulo):
            base = re.split(r"[-/ ]", sigla.strip())[0].upper()
            if len(base) >= 3:
                siglas.add(base)
    return sorted(siglas)


def ficha_del_asistente():
    """Datos reales sobre el asistente y su biblioteca, para que la IA hable de sí misma sin inventar."""
    documentos = biblioteca.catalogo()
    por_fuente = Counter(via or "Lista oficial del reto" for via, _ in documentos)

    lineas_fuentes = []
    for fuente, n in por_fuente.most_common():
        if fuente in DESCRIPCION_FUENTES:
            lineas_fuentes.append(f"- {n} {DESCRIPCION_FUENTES[fuente]}.")
    for via, titulo in documentos:
        if via not in DESCRIPCION_FUENTES:
            origen = via or "Lista oficial del reto"
            lineas_fuentes.append(f"- {titulo} ({origen}).")

    return "\n".join([
        "- Nombre: asistente de FireSpace.",
        "- FireSpace es una plataforma web de divulgación y consulta científica sobre combustión en "
        "microgravedad y seguridad contra incendios en la exploración espacial.",
        "- Es un proyecto de estudiantes universitarios para el NASA Space Apps Challenge 2026. "
        "No es un producto oficial de NASA ni está afiliado a NASA.",
        "- Está pensado para profesores, estudiantes, investigadores e ingenieros aeroespaciales, "
        "pero cualquier persona puede usarlo.",
        "- Cómo funciona: ante cada pregunta busca en su biblioteca los textos más relevantes, responde "
        "solo con ellos y marca cada dato con un número que enlaza al documento original para que el "
        "usuario pueda verificarlo. Si la biblioteca no tiene la información, lo dice en lugar de inventarla.",
        "- Las fuentes están en inglés; el asistente las traduce y responde en español.",
        "- No navega por internet ni usa información fuera de su biblioteca.",
        "- Diferencia con asistentes de IA generales (como ChatGPT): FireSpace se especializa en un solo "
        "tema, responde basándose en fuentes oficiales de NASA y muestra los enlaces para verificar "
        f"cada dato. Para redactar usa un modelo de lenguaje ({MODELO}) a través de OpenRouter.",
        f"- Su biblioteca tiene {len(documentos)} documentos, todos de fuentes oficiales de NASA "
        "indicadas por el reto:",
        *lineas_fuentes,
        f"- Experimentos que cubre: {', '.join(siglas_de_experimentos(documentos))}.",
        "- Temas: comportamiento de las llamas sin gravedad, llamas frías, extinción y supresión de "
        "incendios, inflamabilidad de materiales, combustión de gotas, sólidos y gases, humo y "
        "detección de incendios en naves espaciales.",
    ])


AVISO_PRIMER_MENSAJE = (
    "\n\nIMPORTANTE: este es el PRIMER mensaje de la conversación. No hubo mensajes anteriores: "
    "no digas ni insinúes que ya hablaron de algo, ni retomes temas \"de antes\"."
)


def responder_conversacion(pregunta, historial=()):
    """Respuesta natural a saludos o preguntas sobre el asistente, basada en la ficha."""
    sistema = PROMPT_META.format(ficha=ficha_del_asistente())
    if not historial:
        sistema += AVISO_PRIMER_MENSAJE  # evita que la IA invente una conversación previa
    try:
        texto, modelo = generar(
            [{"role": "system", "content": sistema},
             *historial,
             {"role": "user", "content": pregunta}],
            temperatura=0.4,
            max_tokens=600,
        )
        if texto:
            return texto, modelo
    except Exception as e:
        if es_limite_de_uso(e):
            avisar_limite(e)
        else:
            app.logger.exception("No se pudo generar la respuesta conversacional")
    return respuesta_sobre_el_asistente(), None  # respaldo si la IA falla


def respuesta_sobre_el_asistente():
    """Describe lo que sabe el asistente a partir de la biblioteca real (no lo inventa la IA)."""
    documentos = biblioteca.catalogo()
    por_fuente = Counter(via or "Lista oficial del reto" for via, _ in documentos)
    detalle = ", ".join(f"{n} de {fuente}" for fuente, n in por_fuente.most_common())

    experimentos = ", ".join(siglas_de_experimentos(documentos))

    return (
        "Soy el asistente de FireSpace. Respondo preguntas sobre combustión en el espacio usando "
        f"únicamente una biblioteca de fuentes oficiales de NASA: {len(documentos)} documentos "
        f"({detalle}).\n\n"
        "Puedo ayudarte con temas como:\n"
        "- Cómo se comportan las llamas sin gravedad (forma, llamas frías, extinción).\n"
        "- Seguridad contra incendios en naves espaciales.\n"
        "- Combustión de gotas de combustible, materiales sólidos y gases en la Estación Espacial.\n"
        "- El humo y la detección de incendios en el espacio.\n"
        + (f"- Los experimentos de NASA: {experimentos}.\n" if experimentos else "")
        + "\nPrueba con preguntas como «¿Qué es el experimento Saffire?» o "
        "«¿Por qué las llamas son esféricas en microgravedad?». "
        "Si algo no está en mis fuentes, te lo diré en lugar de inventarlo."
    )


def validar_citas(texto, total):
    """Quita las citas que no corresponden a ningún fragmento y devuelve (texto, citados)."""
    citados = set()

    def reemplazar(coincidencia):
        numeros = [int(n) for n in re.findall(r"\d+", coincidencia.group(1))]
        validos = [n for n in numeros if 1 <= n <= total]
        citados.update(validos)
        return "".join(f"[{n}]" for n in validos)

    # Acepta [2], [1][3] y también [1, 3]
    texto = re.sub(r"\[(\d+(?:\s*,\s*\d+)*)\]", reemplazar, texto)
    return texto, sorted(citados)


def limpiar_redaccion(texto):
    """Respaldo por si la IA menciona sus fuentes internas ("según las fuentes...").
    Quita esas muletillas al inicio de las frases; las citas [n] ya indican el origen."""
    referencia = (r"(?:las fuentes|los fragmentos|los documentos|los textos|la información "
                  r"(?:proporcionada|disponible))(?: (?:de (?:la )?NASA|proporcionad[ao]s|consultad[ao]s|disponibles))?")
    muletilla = re.compile(r"(^|(?<=[.!?]\s)|(?<=\n))(?:Según|De acuerdo con|Con base en|Basándome en) "
                           + referencia + r",?\s+(\w)", re.IGNORECASE)
    return muletilla.sub(lambda m: m.group(1) + m.group(2).upper(), texto)


def agrupar_fuentes(fragmentos, citados):
    """Une en una sola línea las citas que apuntan al mismo documento y la misma página."""
    grupos = {}
    for n in citados:
        f = fragmentos[n - 1]
        clave = (f["url"], f["pagina"])
        if clave not in grupos:
            grupos[clave] = {"numeros": [], "fragmento": f}
        grupos[clave]["numeros"].append(n)
    return [
        {
            "id": ", ".join(str(n) for n in g["numeros"]),
            "titulo": g["fragmento"]["titulo"],
            "url": g["fragmento"]["url"],
            "fuente": describir_fuente(g["fragmento"]),
        }
        for g in grupos.values()
    ]


def describir_fuente(fragmento):
    texto = fragmento["via"] or "Lista oficial del reto"
    if fragmento["pagina"]:
        texto += f", pág. {fragmento['pagina']} del PDF"
    return texto


# ---------- PÁGINAS ----------

@app.route("/")
def inicio():
    return render_template("inicio.html")


@app.route("/asistente")
def asistente():
    return render_template("asistente.html")


@app.route("/simulacion")
def simulacion():
    return render_template("simulacion.html")


# ---------- API ----------

@app.route("/api/preguntar", methods=["POST"])
def preguntar():
    datos = request.get_json(silent=True) or {}
    pregunta = str(datos.get("pregunta", "")).strip()

    if not pregunta:
        return jsonify({"ok": False, "error": "Escribe una pregunta."}), 400
    if len(pregunta) > MAX_CARACTERES_PREGUNTA:
        return jsonify({"ok": False, "error": f"La pregunta no puede pasar de {MAX_CARACTERES_PREGUNTA} caracteres."}), 400
    if not biblioteca.disponible():
        return jsonify({"ok": False, "error": "La biblioteca todavía no está lista."}), 503

    inicio = time.perf_counter()
    historial = limpiar_historial(datos.get("historial"))
    anterior = ultima_pregunta(historial)
    print(f"[FireSpace] Mensajes anteriores recibidos: {len(historial)}"
          + (f" (pregunta anterior: {anterior[:60]!r})" if anterior else " (primer mensaje)"), flush=True)

    # 1. ¿Es una pregunta sobre el asistente o una pregunta para las fuentes?
    try:
        tipo, claves = clasificar(pregunta, anterior) if CLASIFICAR_CON_IA else clasificar_sin_ia(pregunta)
    except LimiteDeUso:
        return jsonify({"ok": False, "error": MENSAJE_LIMITE}), 429
    if tipo == "META":
        texto, modelo = responder_conversacion(pregunta, historial)
        return jsonify({"ok": True, "modelo": modelo, "respuesta": texto, "fuentes": []})

    # 2. Buscar en la biblioteca (palabras en inglés + la pregunta original)
    print(f"[FireSpace] Palabras de búsqueda: {claves or '(ninguna)'}", flush=True)
    texto_busqueda = f"{claves} {pregunta}"
    if anterior and len(pregunta.split()) <= PALABRAS_PREGUNTA_CORTA:
        texto_busqueda += f" {anterior}"  # "¿y eso por qué?" se busca junto con la pregunta anterior
    fragmentos = biblioteca.buscar(texto_busqueda, FRAGMENTOS_POR_PREGUNTA)
    print(f"[FireSpace] Fragmentos encontrados: {len(fragmentos)}", flush=True)

    # 3. Sin documentos no hay respuesta científica: la pregunta pasa al modo conversación,
    #    que responde sobre el asistente o explica con amabilidad que el tema no le corresponde.
    if not fragmentos:
        texto, modelo = responder_conversacion(pregunta, historial)
        return jsonify({"ok": True, "modelo": modelo, "respuesta": texto, "fuentes": []})

    # 4. Pedir la respuesta usando solo los fragmentos encontrados
    contexto = "\n\n".join(
        f"[{i}] (Documento: {f['titulo']})\n{f['texto']}" for i, f in enumerate(fragmentos, start=1)
    )
    try:
        texto, modelo = generar(
            [{"role": "system", "content": PROMPT_RESPUESTA + ("" if historial else AVISO_PRIMER_MENSAJE)},
             *historial,
             {"role": "user", "content": f"Fragmentos:\n\n{contexto}\n\nPregunta: {pregunta}"}],
            temperatura=0.3,
            max_tokens=MAX_TOKENS_RESPUESTA,
        )
    except Exception as e:
        if es_limite_de_uso(e):
            avisar_limite(e)
            return jsonify({"ok": False, "error": MENSAJE_LIMITE}), 429
        app.logger.exception("Error al consultar el modelo")
        if "Timeout" in type(e).__name__:
            return jsonify({"ok": False, "error": "La IA tardó demasiado en responder. Intenta de nuevo en un momento."}), 504
        return jsonify({"ok": False, "error": "No se pudo obtener respuesta de la IA."}), 502

    if not texto:
        return jsonify({"ok": False, "error": "La IA devolvió una respuesta vacía. "
                        "Intenta de nuevo; si se repite, prueba otro modelo."}), 502

    # 5. Validar las citas: solo se muestran fuentes que de verdad se entregaron al modelo
    texto, citados = validar_citas(limpiar_redaccion(texto), len(fragmentos))
    if not citados:
        return jsonify({"ok": True, "modelo": modelo, "respuesta": texto + NOTA_SIN_CITAS, "fuentes": []})

    print(f"[FireSpace] Pregunta respondida en {time.perf_counter() - inicio:.1f} s", flush=True)
    fuentes = agrupar_fuentes(fragmentos, citados)
    return jsonify({"ok": True, "modelo": modelo, "respuesta": texto, "fuentes": fuentes})


if __name__ == "__main__":
    clave = os.getenv("OPENROUTER_API_KEY") or ""
    print(f"[FireSpace] Modelo: {MODELO} | Clave terminada en: ...{clave[-4:]} | "
          f"Clasificar con IA: {'sí' if CLASIFICAR_CON_IA else 'no (modo ahorro)'} | "
          f"Razonamiento: {RAZONAMIENTO}", flush=True)
    app.run(port=5000, debug=False)
