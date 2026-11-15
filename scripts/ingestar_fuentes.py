"""
ingestar_fuentes.py - Llena la biblioteca de FireSpace SOLO con las fuentes del reto.

Lee todos los archivos .txt de data/fuentes/. Cada archivo debe empezar así:

    TITULO: Título de la página o documento
    URL: https://enlace-oficial-de-la-fuente
    VIA: NASA Combustion Science   (desde qué fuente del reto se llegó; opcional)
    ANIO: 2015                     (opcional)
    ---
    Aquí va el texto copiado de la fuente...

El texto se divide en fragmentos de ~1000 caracteres y se guarda en data/firespace.db.
Cada vez que se ejecuta, RECONSTRUYE la biblioteca desde cero.

Uso (desde la carpeta raíz del proyecto, con el entorno virtual activo):
    python scripts/ingestar_fuentes.py
"""

import re
import sqlite3
import textwrap
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CARPETA_FUENTES = RAIZ / "data" / "fuentes"
RUTA_BD = RAIZ / "data" / "firespace.db"

TAM_FRAGMENTO = 1000   # caracteres aproximados por fragmento
MIN_FRAGMENTO = 40     # fragmentos más cortos (ej. un número de página suelto) se ignoran

# Marca de página que escribe pdf_a_txt.py, por ejemplo: === PAGINA 12 ===
MARCA_PAGINA = re.compile(r"^=== PAGINA (\d+) ===\s*$", re.MULTILINE)
SEPARADOR = re.compile(r"^\s*---\s*$", re.MULTILINE)


# ---------- LECTURA DE ARCHIVOS ----------

def leer_fuente(ruta):
    """Separa la cabecera (TITULO, URL, ANIO) del texto. Lanza ValueError si falta algo."""
    contenido = ruta.read_text(encoding="utf-8-sig")
    partes = SEPARADOR.split(contenido, maxsplit=1)
    if len(partes) < 2:
        raise ValueError("falta la línea --- que separa la cabecera del texto")
    cabecera, cuerpo = partes

    datos = {}
    for linea in cabecera.splitlines():
        if ":" in linea:
            clave, valor = linea.split(":", 1)
            datos[clave.strip().upper()] = valor.strip()

    if not datos.get("TITULO") or not datos.get("URL"):
        raise ValueError("la cabecera necesita TITULO y URL")
    if not datos["URL"].startswith("https://"):
        raise ValueError("la URL debe empezar con https://")
    return datos, cuerpo


# ---------- DIVISIÓN EN FRAGMENTOS ----------

def secciones_por_pagina(cuerpo):
    """Devuelve [(pagina, texto), ...]. Si el texto no tiene marcas de página, pagina es None."""
    partes = MARCA_PAGINA.split(cuerpo)
    secciones = [(None, partes[0])]
    for i in range(1, len(partes), 2):
        secciones.append((int(partes[i]), partes[i + 1]))
    return secciones


def dividir_en_fragmentos(cuerpo):
    """Agrupa oraciones hasta ~TAM_FRAGMENTO caracteres, sin mezclar páginas distintas."""
    fragmentos = []
    for pagina, texto in secciones_por_pagina(cuerpo):
        texto = re.sub(r"-\n(?=\w)", "", texto)    # une palabras cortadas: "combus-\ntion"
        texto = re.sub(r"\s+", " ", texto).strip()  # quita saltos de línea y espacios extra
        if not texto:
            continue

        actual = ""
        for oracion in re.split(r"(?<=[.!?])\s+", texto):
            # Una "oración" enorme (sin puntos) se corta en trozos.
            for trozo in textwrap.wrap(oracion, TAM_FRAGMENTO) or [""]:
                if actual and len(actual) + len(trozo) + 1 > TAM_FRAGMENTO:
                    fragmentos.append((pagina, actual))
                    actual = trozo
                else:
                    actual = f"{actual} {trozo}".strip()
        if actual:
            fragmentos.append((pagina, actual))

    return [(p, t) for p, t in fragmentos if len(t) >= MIN_FRAGMENTO]


# ---------- BASE DE DATOS ----------

def fts5_disponible(con):
    try:
        con.execute("CREATE VIRTUAL TABLE temp.prueba_fts USING fts5(x)")
        con.execute("DROP TABLE temp.prueba_fts")
        return True
    except sqlite3.OperationalError:
        return False


def crear_tablas(con):
    con.executescript("""
        DROP TABLE IF EXISTS fragmentos;
        DROP TABLE IF EXISTS documentos;

        CREATE TABLE documentos (
            id            TEXT PRIMARY KEY,   -- nombre del archivo, ej. "apollo_1"
            titulo        TEXT NOT NULL,
            url           TEXT NOT NULL,
            anio          TEXT,
            via           TEXT,               -- fuente del reto desde la que se llegó
            archivo       TEXT NOT NULL,
            fecha_ingesta TEXT
        );

        CREATE VIRTUAL TABLE fragmentos USING fts5(
            documento_id UNINDEXED,
            orden UNINDEXED,
            pagina UNINDEXED,
            texto,
            tokenize = 'porter unicode61'
        );
    """)


# ---------- PROGRAMA PRINCIPAL ----------

def main():
    if not CARPETA_FUENTES.exists():
        CARPETA_FUENTES.mkdir(parents=True)
        print(f"Creé la carpeta {CARPETA_FUENTES}. Pon ahí los .txt de las fuentes y vuelve a ejecutar.")
        return

    archivos = sorted(CARPETA_FUENTES.glob("*.txt"))
    if not archivos:
        print(f"No hay archivos .txt en {CARPETA_FUENTES}.")
        return

    con = sqlite3.connect(RUTA_BD)
    try:
        if not fts5_disponible(con):
            print("Tu versión de SQLite no tiene FTS5. Avísame y buscamos otra opción.")
            return

        crear_tablas(con)
        print(f"Biblioteca reiniciada en: {RUTA_BD}\n")

        documentos = 0
        total_fragmentos = 0
        for ruta in archivos:
            try:
                datos, cuerpo = leer_fuente(ruta)
            except ValueError as e:
                print(f"  {ruta.name}: SE OMITE ({e})")
                continue
            except UnicodeDecodeError:
                print(f"  {ruta.name}: SE OMITE (guárdalo con codificación UTF-8)")
                continue

            fragmentos = dividir_en_fragmentos(cuerpo)
            if not fragmentos:
                print(f"  {ruta.name}: SE OMITE (no tiene texto)")
                continue

            id_doc = ruta.stem
            con.execute(
                "INSERT INTO documentos (id, titulo, url, anio, via, archivo, fecha_ingesta) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (id_doc, datos["TITULO"], datos["URL"], datos.get("ANIO"),
                 datos.get("VIA", "Lista oficial del reto"), ruta.name,
                 datetime.now(timezone.utc).isoformat(timespec="seconds")),
            )
            for orden, (pagina, texto) in enumerate(fragmentos):
                if orden == 0:
                    texto = f"{datos['TITULO']}\n\n{texto}"  # el título ayuda a encontrarlo
                con.execute(
                    "INSERT INTO fragmentos (documento_id, orden, pagina, texto) VALUES (?, ?, ?, ?)",
                    (id_doc, orden, pagina, texto),
                )

            documentos += 1
            total_fragmentos += len(fragmentos)
            print(f"  {ruta.name}: {len(fragmentos)} fragmentos  ->  {datos['TITULO']}")

        con.commit()
        print("-" * 60)
        print(f"Biblioteca lista: {documentos} documentos, {total_fragmentos} fragmentos.")
    finally:
        con.close()


if __name__ == "__main__":
    main()
