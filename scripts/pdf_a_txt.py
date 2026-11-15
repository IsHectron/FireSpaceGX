"""
pdf_a_txt.py - Descarga y convierte a texto los PDFs oficiales del reto.

Incluye la Guía del investigador (lista oficial del reto) y los PDFs de los
experimentos enlazados desde la página NASA Combustion Science.
Cada PDF se guarda en data/pdf/ y su texto en data/fuentes/<id>.txt,
conservando el número de página de cada parte.

Antes de usarlo:
    pip install pypdf

Uso (desde la carpeta raíz del proyecto, con el entorno virtual activo):
    python scripts/pdf_a_txt.py
"""

import sys
import urllib.error
import urllib.request
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    print("Falta la biblioteca pypdf. Instálala con: pip install pypdf")
    sys.exit(1)

RAIZ = Path(__file__).resolve().parent.parent
CARPETA_PDF = RAIZ / "data" / "pdf"
CARPETA_FUENTES = RAIZ / "data" / "fuentes"

CABECERAS = {"User-Agent": "FireSpace/0.1 (prototipo estudiantil, NASA Space Apps Challenge)"}

COMBUSTION_SCIENCE = "NASA Combustion Science"
BASE = "https://www.nasa.gov/wp-content/uploads/2025/07/"

# id: nombre de los archivos | pdf: de dónde se descarga | url: enlace que se mostrará como fuente
# via: desde qué fuente del reto se llega a este documento
FUENTES_PDF = [
    {
        "id": "guia_investigador",
        "titulo": "A Researcher's Guide to: Combustion Science",
        "pdf": "https://www.nasa.gov/wp-content/uploads/2016/05/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf",
        "url": "https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/",
        "via": "Lista oficial del reto",
        "anio": "2015",
    },
    {"id": "exp_acme", "titulo": "Advanced Combustion via Microgravity Experiments (ACME)",
     "pdf": BASE + "advanced-combustion-via-microgravity-experiments-acme.pdf", "via": COMBUSTION_SCIENCE},
    {"id": "exp_bass", "titulo": "Burning and Suppression of Solids (BASS)",
     "pdf": BASE + "burning-and-suppression-of-solids-bass.pdf", "via": COMBUSTION_SCIENCE},
    {"id": "exp_daft", "titulo": "Dust and Aerosol Measurement Feasibility Test (DAFT)",
     "pdf": BASE + "dust-and-aerosol-measurement-feasibility-test-daft.pdf", "via": COMBUSTION_SCIENCE},
    {"id": "exp_flex", "titulo": "Flame Extinguishment Experiment (FLEX)",
     "pdf": BASE + "flame-extinguishment-experiment-flex.pdf", "via": COMBUSTION_SCIENCE},
    {"id": "exp_saffire", "titulo": "Spacecraft Fire Safety Demonstration (Saffire)",
     "pdf": BASE + "spacecraft-fire-safety-demonstration-saffire.pdf", "via": COMBUSTION_SCIENCE},
    {"id": "exp_same", "titulo": "Smoke Aerosol Measurement Experiment (SAME)",
     "pdf": BASE + "smoke-aerosol-measurement-experiment-same.pdf", "via": COMBUSTION_SCIENCE},
    {"id": "exp_slice", "titulo": "Structure & Liftoff in Combustion Experiment (SLICE)",
     "pdf": BASE + "structure-liftoff-in-combustion-experiment-slice.pdf", "via": COMBUSTION_SCIENCE},
    {"id": "exp_spice", "titulo": "Smoke Point in Co-flow Experiment (SPICE)",
     "pdf": BASE + "smoke-point-in-co-flow-experiment-spice.pdf", "via": COMBUSTION_SCIENCE},
]


def descargar(url, destino):
    """Descarga el PDF. Lanza ValueError si lo recibido no es un PDF."""
    peticion = urllib.request.Request(url, headers=CABECERAS)
    with urllib.request.urlopen(peticion, timeout=60) as respuesta:
        contenido = respuesta.read()
    if not contenido.startswith(b"%PDF"):
        raise ValueError("lo descargado no es un PDF")
    destino.write_bytes(contenido)


def convertir(ruta_pdf, fuente):
    """Extrae el texto página por página y escribe el .txt con su cabecera."""
    lector = PdfReader(ruta_pdf)
    lineas = [
        f"TITULO: {fuente['titulo']}",
        f"URL: {fuente.get('url', fuente['pdf'])}",
        f"VIA: {fuente['via']}",
    ]
    if fuente.get("anio"):
        lineas.append(f"ANIO: {fuente['anio']}")
    lineas.append("---")

    con_texto = 0
    for numero, pagina in enumerate(lector.pages, start=1):
        texto = (pagina.extract_text() or "").strip()
        if texto:
            con_texto += 1
        lineas.append(f"=== PAGINA {numero} ===")
        lineas.append(texto)

    (CARPETA_FUENTES / f"{fuente['id']}.txt").write_text("\n".join(lineas), encoding="utf-8")
    return len(lector.pages), con_texto


def main():
    CARPETA_PDF.mkdir(parents=True, exist_ok=True)
    CARPETA_FUENTES.mkdir(parents=True, exist_ok=True)

    for fuente in FUENTES_PDF:
        ruta_pdf = CARPETA_PDF / f"{fuente['id']}.pdf"

        if not ruta_pdf.exists():
            try:
                descargar(fuente["pdf"], ruta_pdf)
            except (urllib.error.URLError, TimeoutError, ValueError) as e:
                print(f"  {fuente['id']}: NO SE PUDO DESCARGAR ({e})")
                print(f"      Descárgalo a mano desde {fuente['pdf']}")
                print(f"      y guárdalo como {ruta_pdf}")
                continue

        try:
            paginas, con_texto = convertir(ruta_pdf, fuente)
        except Exception as e:  # pypdf puede lanzar varios tipos de error con PDFs dañados
            print(f"  {fuente['id']}: NO SE PUDO LEER EL PDF ({e}). Bórralo y vuelve a ejecutar.")
            continue

        aviso = "  <- ojo: sin texto, puede ser solo imágenes" if con_texto == 0 else ""
        print(f"  {fuente['id']}: {paginas} páginas ({con_texto} con texto){aviso}")

    print("\nListo. Ahora ejecuta: python scripts/ingestar_fuentes.py")


if __name__ == "__main__":
    main()
