"""
biblioteca.py - Búsqueda en la biblioteca de FireSpace (data/firespace.db).

Lo usa app.py para encontrar los fragmentos de las fuentes del reto
que tienen relación con la pregunta del usuario.
"""

import re
import sqlite3
import unicodedata
from pathlib import Path

RUTA_BD = Path(__file__).resolve().parent / "data" / "firespace.db"


def disponible():
    """True si la base de datos ya fue creada con scripts/ingestar_fuentes.py."""
    return RUTA_BD.exists()


# Diccionario de respaldo español -> inglés con los términos más comunes del tema.
# Se usa aunque falle la traducción de la IA, porque los documentos están en inglés.
# La clave es el inicio de la palabra (sin acentos): "llama" también cubre "llamas".
GLOSARIO = {
    "microgravedad": "microgravity", "ingravidez": "microgravity weightlessness",
    "gravedad": "gravity", "llama": "flame", "fuego": "fire", "incendi": "fire",
    "combusti": "combustion fuel", "quema": "burning", "arde": "burning",
    "oxigen": "oxygen", "humo": "smoke", "hollin": "soot", "gota": "droplet",
    "extin": "extinction extinguishment", "supres": "suppression suppressant",
    "inflamab": "flammability flammable", "ignici": "ignition", "encend": "ignition",
    "propaga": "spread propagation", "nave": "spacecraft", "estacion": "station",
    "espacial": "space", "espacio": "space", "astronaut": "astronaut crew",
    "tripula": "crew", "luna": "moon lunar", "lunar": "lunar moon", "marte": "mars",
    "detect": "detection detector", "sensor": "sensor", "temperatura": "temperature",
    "presion": "pressure", "flotabilidad": "buoyancy", "convecci": "convection",
    "ventila": "ventilation", "flujo": "flow", "aire": "air", "seguridad": "safety",
    "riesgo": "hazard risk", "material": "material", "solido": "solid", "tela": "fabric",
    "plastico": "plastic", "bombero": "firefighter", "traje": "suit", "tanque": "tank",
    "experiment": "experiment investigation", "hipotesis": "hypothesis",
    "beneficio": "benefits", "tierra": "earth", "motor": "engine",
}


def sin_acentos(texto):
    return "".join(c for c in unicodedata.normalize("NFD", texto) if unicodedata.category(c) != "Mn")


def terminos_en_ingles(texto):
    """Agrega los equivalentes en inglés de las palabras del glosario que aparecen en el texto."""
    extra = []
    for palabra in re.findall(r"\w+", sin_acentos(texto.lower())):
        for inicio, traduccion in GLOSARIO.items():
            if palabra.startswith(inicio):
                extra.append(traduccion)
    return " ".join(extra)


# Palabras del español que no aportan a la búsqueda y que, al ser cortas, coinciden por
# casualidad con textos en inglés (por ejemplo "de" en apellidos como "de Ris").
PALABRAS_VACIAS = set("""
a al algo como con cual cuales cuando de del donde dame dime el ella ellos en entre es esta este esto
explica explicame fue ha hay la las le les lo los mas me mi muy no o para pero por porque puedes que
quien se ser si sin sobre son su sus te tiene tienen tu un una uno unos y ya yo
""".split())


def construir_consulta(texto):
    """Convierte texto libre en una consulta segura: "palabra1" OR "palabra2" ..."""
    palabras = [
        p for p in re.findall(r"\w+", texto.lower())
        if len(p) > 1 and sin_acentos(p) not in PALABRAS_VACIAS
    ]
    return " OR ".join(f'"{p}"' for p in dict.fromkeys(palabras))  # sin repetidas


def buscar(texto, limite=6, por_documento=2):
    """Devuelve los fragmentos más relevantes como lista de diccionarios.
    Toma como máximo `por_documento` fragmentos de un mismo documento,
    para que las respuestas combinen varias fuentes."""
    consulta = construir_consulta(f"{texto} {terminos_en_ingles(texto)}")
    if not consulta or not disponible():
        return []

    con = sqlite3.connect(RUTA_BD)
    try:
        filas = con.execute(
            """SELECT d.id, d.titulo, d.url, d.via, fragmentos.pagina, fragmentos.texto,
                      bm25(fragmentos)
               FROM fragmentos
               JOIN documentos AS d ON d.id = fragmentos.documento_id
               WHERE fragmentos MATCH ?
               ORDER BY bm25(fragmentos)
               LIMIT ?""",
            (consulta, limite * 5),  # se piden de más para poder repartir entre documentos
        ).fetchall()
    finally:
        con.close()

    elegidos = []
    usados = {}
    for id_doc, titulo, url, via, pagina, texto, puntaje in filas:
        if usados.get(id_doc, 0) >= por_documento:
            continue
        usados[id_doc] = usados.get(id_doc, 0) + 1
        elegidos.append({
            "id_documento": id_doc, "titulo": titulo, "url": url, "via": via,
            "pagina": pagina, "texto": texto,
            "puntaje": puntaje,  # relevancia de SQLite: más negativo = más relevante
        })
        if len(elegidos) == limite:
            break
    return elegidos


def catalogo():
    """Devuelve [(via, titulo), ...] de todos los documentos de la biblioteca."""
    if not disponible():
        return []
    con = sqlite3.connect(RUTA_BD)
    try:
        return con.execute("SELECT via, titulo FROM documentos ORDER BY titulo").fetchall()
    finally:
        con.close()


# Campos de la ficha de una investigación de PSI, tal como los escribe scripts/psi_a_txt.py
CAMPOS_PSI = {
    "plataforma": r"Flight platform: ([^\n]+?)\.(?:\s|$)",
    "tipo_proyecto": r"Project type: ([^\n]+?)\.(?:\s|$)",
    "area": r"Research area: ([^\n]+?)\.(?:\s|$)",
    "inicio": r"Start date: ([\d-]+)",
    "fin": r"End date: ([\d-]+)",
    "equipo": r"Experiment hardware: ([^\n]+?)\.(?:\s|$)",
}


def detalles_psi(id_documento):
    """Lee la ficha (plataforma, fechas, equipo...) de una investigación de PSI.
    Devuelve {} si el documento no es de PSI o no tiene esos datos."""
    if not str(id_documento).startswith("psi_") or not disponible():
        return {}
    con = sqlite3.connect(RUTA_BD)
    try:
        filas = con.execute(
            "SELECT texto FROM fragmentos WHERE documento_id = ? ORDER BY orden", (id_documento,)
        ).fetchall()
    finally:
        con.close()
    texto = " ".join(fila[0] for fila in filas)
    detalles = {}
    for campo, patron in CAMPOS_PSI.items():
        encontrado = re.search(patron, texto)
        if encontrado:
            detalles[campo] = " ".join(encontrado.group(1).split())[:150]
    return detalles
