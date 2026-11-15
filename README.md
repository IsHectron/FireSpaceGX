# FireSpace

Proyecto para el NASA Space Apps Challenge 2026. Proyecto estudiantil, no oficial de NASA.

## Cómo ejecutarlo después de clonar

**Requisitos:** Python 3.10 o superior y una clave gratuita de [OpenRouter](https://openrouter.ai) (*Settings → Keys*).

**1. Crear el entorno virtual e instalar dependencias**

Windows (PowerShell):
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Mac / Linux:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**2. Crear el archivo `.env`**

Copia `.env.example` con el nombre `.env` (en la misma carpeta que `app.py`) y pon tu propia clave de OpenRouter en `OPENROUTER_API_KEY`. Nunca subas el archivo `.env` a GitHub.

**3. Construir la biblioteca de fuentes**
```bash
python scripts/ingestar_fuentes.py
```

**4. Iniciar la aplicación**
```bash
python app.py
```

Abre **http://localhost:5000** en el navegador.
