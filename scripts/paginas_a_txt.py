"""
paginas_a_txt.py - Descarga las páginas web de las fuentes del reto y guarda
solo los párrafos del artículo (sin menús ni pies de página) en data/fuentes/.

Si un archivo ya existe, NO se sobrescribe (por si lo corregiste a mano).
Para regenerarlo, bórralo y vuelve a ejecutar el script.

Uso (desde la carpeta raíz del proyecto, con el entorno virtual activo):
    python scripts/paginas_a_txt.py
Después:
    python scripts/ingestar_fuentes.py
"""

import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CARPETA_FUENTES = RAIZ / "data" / "fuentes"

CABECERAS = {"User-Agent": "Mozilla/5.0 (FireSpace, prototipo estudiantil NASA Space Apps Challenge)"}

CS = "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/"

# via = None significa que la página está directamente en la lista oficial del reto.
PAGINAS = [
    {"id": "web_combustion_science", "titulo": "NASA Combustion Science", "via": None,
     "url": CS + "combustion-science/"},
    {"id": "web_fm2", "titulo": "Flammability of Materials on the Moon (FM2)", "via": "NASA Combustion Science",
     "url": CS + "combustion-science/flammability-of-materials-on-the-moon-fm2/"},
    {"id": "web_sofie", "titulo": "Solid Fuel Ignition and Extinction (SoFIE)", "via": "NASA Combustion Science",
     "url": CS + "combustion-science/solid-fuel-ignition-and-extinction-sofie/"},
    {"id": "web_flare", "titulo": "Flammability Limits At Reduced-g Experiment (FLARE)", "via": "NASA Combustion Science",
     "url": CS + "combustion-science/flammability-limits-at-reduced-g-experiment-flare/"},
    {"id": "web_mdca", "titulo": "Multi-user Droplet Combustion Apparatus (MDCA)", "via": "NASA Combustion Science",
     "url": CS + "combustion-science/multi-user-droplet-combustion-apparatus-mdca/"},
    {"id": "web_cir", "titulo": "Fluids and Combustion Facility / Combustion Integrated Rack (CIR)",
     "via": "NASA Combustion Science", "url": CS + "fluids-combustion-facility/"},
    {"id": "web_apollo_1", "titulo": "Apollo 1", "via": None,
     "url": "https://sma.nasa.gov/sma-disciplines/accllp/apollo-1"},
    {"id": "web_apollo_13", "titulo": "Apollo 13", "via": None,
     "url": "https://sma.nasa.gov/sma-disciplines/accllp/apollo-13"},
    {"id": "web_mir", "titulo": "25 Years Ago: Fire Aboard Space Station Mir", "via": None,
     "url": "https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/"},
    {"id": "web_spinoff_tanques_aire", "titulo": "Fireman's Air Tanks (NASA Spinoff)", "via": None,
     "url": "https://spinoff.nasa.gov/node/9582"},
    {"id": "web_spinoff_detector", "titulo": "Fire Detector (NASA Spinoff)", "via": None,
     "url": "https://spinoff.nasa.gov/node/9407"},
    {"id": "web_spinoff_traje", "titulo": "New Technology for the Fire Attire (NASA Spinoff)", "via": None,
     "url": "https://spinoff.nasa.gov/node/9918"},
]

MIN_PARRAFO = 60          # párrafos más cortos suelen ser botones, fechas o menús
MIN_ELEMENTO_LISTA = 80   # los elementos de menú son cortos; las viñetas del artículo, largas
MIN_TEXTO_PAGINA = 200    # si se extrae menos, la página probablemente necesita copia manual

FRASES_DE_RELLENO = [
    "NASA explores the unknown",
    "Was this page helpful",
    "An official website of the United States government",
    "Official websites use .gov",
    "Secure .gov websites use HTTPS",
]
TITULOS_DE_CORTE = {"keep exploring", "discover more topics from nasa"}


class ExtractorParrafos(HTMLParser):
    """Recorre el HTML y junta el texto de párrafos, viñetas y celdas,
    ignorando scripts, menús, encabezados y pies de página."""

    IGNORAR = {"script", "style", "nav", "header", "footer", "aside", "form", "noscript", "svg"}
    BLOQUES = {"p", "li", "td"}
    TITULOS = {"h1", "h2", "h3", "h4"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ignorando = 0
        self.etiqueta = None
        self.actual = None
        self.bloques = []
        self.detenido = False

    def _cerrar_bloque(self):
        if self.actual is not None:
            texto = " ".join("".join(self.actual).split())
            if self.etiqueta in self.TITULOS:
                if texto.lower() in TITULOS_DE_CORTE:
                    self.detenido = True  # a partir de aquí solo hay enlaces a otras noticias
            elif not self.detenido:
                self.bloques.append((self.etiqueta, texto))
        self.actual = None
        self.etiqueta = None

    def handle_starttag(self, tag, attrs):
        if tag in self.IGNORAR:
            self.ignorando += 1
        elif not self.ignorando and (tag in self.BLOQUES or tag in self.TITULOS):
            if self.actual is not None and tag == self.etiqueta:
                self._cerrar_bloque()  # un <p> nuevo sin haber cerrado el anterior
            if self.actual is None:
                self.etiqueta = tag
                self.actual = []

    def handle_endtag(self, tag):
        if tag in self.IGNORAR and self.ignorando:
            self.ignorando -= 1
        elif tag == self.etiqueta:
            self._cerrar_bloque()

    def handle_data(self, data):
        if self.actual is not None and not self.ignorando:
            self.actual.append(data)


def extraer_texto(html):
    extractor = ExtractorParrafos()
    extractor.feed(html)
    extractor._cerrar_bloque()

    parrafos = []
    vistos = set()
    for etiqueta, texto in extractor.bloques:
        minimo = MIN_ELEMENTO_LISTA if etiqueta == "li" else MIN_PARRAFO
        if len(texto) < minimo or texto in vistos:
            continue
        if any(frase in texto for frase in FRASES_DE_RELLENO):
            continue
        vistos.add(texto)
        parrafos.append(texto)
    return "\n\n".join(parrafos)


def descargar(url):
    peticion = urllib.request.Request(url, headers=CABECERAS)
    with urllib.request.urlopen(peticion, timeout=60) as respuesta:
        codificacion = respuesta.headers.get_content_charset() or "utf-8"
        return respuesta.read().decode(codificacion, errors="replace")


def main():
    CARPETA_FUENTES.mkdir(parents=True, exist_ok=True)
    revisar = []

    for pagina in PAGINAS:
        destino = CARPETA_FUENTES / f"{pagina['id']}.txt"
        if destino.exists():
            print(f"  {destino.name}: ya existe, se deja igual (bórralo para regenerarlo)")
            continue

        try:
            texto = extraer_texto(descargar(pagina["url"]))
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"  {destino.name}: NO SE PUDO DESCARGAR ({e})")
            revisar.append(pagina)
            continue

        if len(texto) < MIN_TEXTO_PAGINA:
            print(f"  {destino.name}: solo se extrajeron {len(texto)} caracteres, NO se guardó")
            revisar.append(pagina)
            continue

        cabecera = [f"TITULO: {pagina['titulo']}", f"URL: {pagina['url']}"]
        if pagina["via"]:
            cabecera.append(f"VIA: {pagina['via']}")
        destino.write_text("\n".join(cabecera + ["---", texto]), encoding="utf-8")
        print(f"  {destino.name}: {len(texto)} caracteres")

    print("-" * 60)
    if revisar:
        print("Estas páginas hay que copiarlas a mano (abre el enlace y pega el texto del artículo):")
        for pagina in revisar:
            print(f"  - {pagina['id']}.txt  <-  {pagina['url']}")
    print("Revisa los .txt creados: si alguno tiene texto que no es del artículo, bórralo de ese archivo.")
    print("Después ejecuta: python scripts/ingestar_fuentes.py")


if __name__ == "__main__":
    main()
