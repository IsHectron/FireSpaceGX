"""
probar_busqueda.py - Prueba la búsqueda dentro de la biblioteca de FireSpace.

Busca en data/firespace.db (creada por ingestar_fuentes.py) y muestra los
5 documentos más relevantes. Así comprobamos que la recuperación funciona
antes de conectarla al asistente.

Uso (por ahora, con términos en inglés):
    python scripts/probar_busqueda.py "flame spread"
"""

import re
import sqlite3
import sys
from pathlib import Path

RUTA_BD = Path(__file__).resolve().parent.parent / "data" / "firespace.db"


def construir_consulta(texto):
    """Convierte texto libre en una consulta FTS5 segura: "palabra1" OR "palabra2" ..."""
    palabras = [p for p in re.findall(r"\w+", texto.lower()) if len(p) > 1]
    return " OR ".join(f'"{p}"' for p in palabras)


def main():
    if len(sys.argv) < 2:
        print('Uso: python scripts/probar_busqueda.py "flame spread"')
        return
    if not RUTA_BD.exists():
        print("No existe la biblioteca. Ejecuta primero: python scripts/ingestar_fuentes.py")
        return

    consulta = construir_consulta(" ".join(sys.argv[1:]))
    if not consulta:
        print("Escribe al menos una palabra de búsqueda.")
        return

    con = sqlite3.connect(RUTA_BD)
    try:
        filas = con.execute(
            """SELECT d.titulo, d.anio, d.url, fragmentos.pagina,
                      snippet(fragmentos, 3, '[', ']', '...', 20),
                      bm25(fragmentos) AS puntaje
               FROM fragmentos
               JOIN documentos AS d ON d.id = fragmentos.documento_id
               WHERE fragmentos MATCH ?
               ORDER BY puntaje
               LIMIT 5""",
            (consulta,),
        ).fetchall()
    finally:
        con.close()

    print(f"Consulta enviada a SQLite: {consulta}\n")
    if not filas:
        print("Sin resultados en la biblioteca.")
        return

    for numero, (titulo, anio, url, pagina, fragmento, puntaje) in enumerate(filas, start=1):
        donde = f", página {pagina} del PDF" if pagina else ""
        print(f"[{numero}] {titulo} ({anio or 's/f'}{donde})")
        print(f"    Relevancia (más negativo = más relevante): {puntaje:.3f}")
        print(f"    Extracto: {fragmento}")
        print(f"    Ficha: {url}\n")


if __name__ == "__main__":
    main()
