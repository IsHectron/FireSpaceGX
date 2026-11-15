"""
psi_a_txt.py - Descarga las investigaciones de combustión del repositorio PSI de NASA
y las guarda como fuentes para la biblioteca de FireSpace.

Usa la misma dirección pública que usa la página de PSI para mostrar sus resultados.
Crea un archivo data/fuentes/psi_<numero>.txt por cada investigación del área
"Combustion Science", y guarda la respuesta original en data/psi/investigaciones.json.

Uso (desde la carpeta raíz del proyecto, con el entorno virtual activo):
    python scripts/psi_a_txt.py
Después:
    python scripts/ingestar_fuentes.py
"""

import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CARPETA_FUENTES = RAIZ / "data" / "fuentes"
CARPETA_PSI = RAIZ / "data" / "psi"

URL_API = "https://psi.nasa.gov/geode-py/ws/repo/search"
PARAMETROS = {
    "term": "combustion",
    "source": "psi",
    "type": "investigation",
    "sort": "Public Release Date",
    "order": "desc",
}

# Enlace que se mostrará como fuente de cada investigación.
# Si encuentras la dirección directa de la página de un estudio en PSI,
# cambia esta plantilla ({acc} se reemplaza por el número, ej. PSI-69).
URL_ESTUDIO = "https://psi.nasa.gov/physci/repo/data/investigations/{acc}"
AREA_BUSCADA = "Combustion Science"

CABECERAS = {
    "User-Agent": "FireSpace/0.1 (prototipo estudiantil, NASA Space Apps Challenge)",
    "Accept": "application/json",
}

# Campos de texto que se guardan, con el título que llevará cada sección.
SECCIONES = [
    ("Objectives", "Objectives"),
    ("Approach", "Approach"),
    ("Hypothesis", "Hypothesis"),
    ("Research Impacts/Earth Benefits", "Research impacts and Earth benefits"),
]


def descargar(parametros_extra=None):
    parametros = dict(PARAMETROS, **(parametros_extra or {}))
    url = f"{URL_API}?{urllib.parse.urlencode(parametros)}"
    peticion = urllib.request.Request(url, headers=CABECERAS)
    with urllib.request.urlopen(peticion, timeout=60) as respuesta:
        return json.loads(respuesta.read().decode("utf-8"))


def obtener_investigaciones():
    """Descarga los resultados; si vienen incompletos, intenta pedir más por página."""
    datos = descargar()
    total = datos["hits"]["total"]
    if len(datos["hits"]["hits"]) < total:
        try:
            mas = descargar({"size": 100})
            if len(mas["hits"]["hits"]) > len(datos["hits"]["hits"]):
                datos = mas
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError):
            pass
    return datos, total


def texto(valor):
    return str(valor or "").strip()


def construir_txt(inv):
    """Arma el contenido del .txt (cabecera + cuerpo) de una investigación."""
    acc = texto(inv.get("Accession"))
    titulo = texto(inv.get("Title"))
    sigla = texto(inv.get("Acronym"))
    titulo_completo = f"{titulo} ({sigla})" if sigla else titulo

    datos_generales = [
        f"PSI investigation {acc}: {titulo_completo}.",
        f"Research area: {texto(inv.get('Research Area'))}"
        + (f", {texto(inv.get('SubResearch Area'))}." if texto(inv.get("SubResearch Area")) else "."),
    ]
    for campo, etiqueta in [
        ("Project Type", "Project type"),
        ("Flight Platform", "Flight platform"),
        ("Monitoring Center", "Monitoring center"),
        ("Investigation Start Date", "Start date"),
        ("Investigation End Date", "End date"),
    ]:
        if texto(inv.get(campo)):
            datos_generales.append(f"{etiqueta}: {texto(inv.get(campo))}.")
    palabras = " ".join(texto(inv.get("Keywords")).split())
    if palabras:
        datos_generales.append(f"Keywords: {palabras}.")
    equipo = texto((inv.get("Experiment Hardware") or {}).get("Name"))
    if equipo:
        datos_generales.append(f"Experiment hardware: {' '.join(equipo.split())}.")

    lineas = [
        f"TITULO: {titulo_completo} [{acc}]",
        f"URL: {URL_ESTUDIO.format(acc=urllib.parse.quote(acc))}",
        "VIA: PSI",
        "---",
        " ".join(datos_generales),
        "",
    ]
    for campo, etiqueta in SECCIONES:
        contenido = texto(inv.get(campo))
        if contenido:
            lineas.append(f"{etiqueta}: {contenido}")
            lineas.append("")
    return acc, "\n".join(lineas)


def main():
    CARPETA_FUENTES.mkdir(parents=True, exist_ok=True)
    CARPETA_PSI.mkdir(parents=True, exist_ok=True)

    try:
        datos, total = obtener_investigaciones()
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"No se pudo conectar con PSI: {e}")
        return
    except (json.JSONDecodeError, KeyError):
        print("PSI respondió algo inesperado (no es el formato de siempre).")
        return

    (CARPETA_PSI / "investigaciones.json").write_text(
        json.dumps(datos, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    resultados = [h.get("_source", {}) for h in datos["hits"]["hits"]]
    guardadas = 0
    otras_areas = []
    for inv in resultados:
        if texto(inv.get("Research Area")) != AREA_BUSCADA:
            otras_areas.append(texto(inv.get("Accession")))
            continue
        acc, contenido = construir_txt(inv)
        nombre = "psi_" + acc.lower().replace("psi-", "")
        (CARPETA_FUENTES / f"{nombre}.txt").write_text(contenido, encoding="utf-8")
        guardadas += 1
        print(f"  {nombre}.txt  ->  {inv.get('Title')}")

    print("-" * 60)
    print(f"PSI reporta {total} resultados; se recibieron {len(resultados)}.")
    if len(resultados) < total:
        print(f"  Ojo: faltaron {total - len(resultados)}. Avísame para buscar cómo pedirlos.")
    if otras_areas:
        print(f"  Se omitieron por no ser de {AREA_BUSCADA}: {', '.join(otras_areas)}")
    print(f"Investigaciones de combustión guardadas: {guardadas}")
    print("\nAhora ejecuta: python scripts/ingestar_fuentes.py")


if __name__ == "__main__":
    main()
