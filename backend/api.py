from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import uvicorn
import os
import shutil
import asyncio
import uuid
import tempfile
import zipfile
import subprocess

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def cleanup_files(work_dir: str, zip_path: str):
    shutil.rmtree(work_dir, ignore_errors=True)
    if os.path.exists(zip_path):
        os.remove(zip_path)

@app.get("/")
def read_root():
    return {"status": "ok"}

@app.post("/run_manus")
async def run_manus(
    background_tasks: BackgroundTasks,
    idea: str = Form(...),
    additionalInfo: str = Form(""),
    apiKey: str = Form(...),
    model: str = Form(...),
    file: UploadFile = File(None)
):
    session_id = str(uuid.uuid4())
    work_dir = os.path.join(os.getcwd(), f"workspace_{session_id}")
    os.makedirs(work_dir, exist_ok=True)

    # Check if OpenManus exists, if not we will clone it dynamically just for this run to avoid commiting heavy stuff
    openmanus_dir = os.path.join(os.getcwd(), f"OpenManus_{session_id}")
    try:
        shutil.copytree(os.path.join(os.getcwd(), "OpenManus"), openmanus_dir)
    except Exception as e:
        # Fallback to cloning if we don't have a cached version
        print("Cloning OpenManus...")
        proc = await asyncio.create_subprocess_exec(
            "git", "clone", "https://github.com/FoundationAgents/OpenManus.git", openmanus_dir
        )
        await proc.communicate()

    # Optional File saving
    file_content = ""
    if file:
        file_path = os.path.join(work_dir, file.filename)
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        file_content = f"Attached File Context ({file.filename}):\n"
        try:
            file_content += content.decode("utf-8") + "\n\n"
        except:
            file_content += "[Binary or non-utf8 file attached]\n\n"

    # Construct the strict prompt for OpenManus
    prompt = f"""Du bist ein Experten-Entwickler und System-Architekt-Agent für ein Spiele-/Software-Studio.

    Ich möchte, dass du die folgende Idee/Manuskript analysierst und in diesem Ordner ein vollständiges Projekt erstellst: {work_dir}

    Idee/Manuskript: {idea}
    Zusätzliche Infos: {additionalInfo}
    {file_content}

    DEINE AUFGABE:
    1. Erstelle die Logik und den Code (z.B. HTML/JS/CSS oder Python) in dem Ordner: {work_dir}
    2. Wenn du Grafiken oder Sounds benötigst, verwende in deinem Code relative Pfade (z.B. './assets/grafik/player.png' oder './assets/sound/jump.mp3').
    3. WICHTIG: Erstelle eine Datei namens 'assets.md' im Ordner {work_dir}. In dieser Datei MUST DU ALLE benötigten Grafiken und Sounds auflisten. Jede Zeile MUSS enthalten: Dateiname, genauer Pfad im Projekt, und genaue erforderliche Größe/Dimensionen (z.B. 32x32 Pixel für Bilder, oder ungefähre Länge für Sound). Ich werde diese Dateien später bereitstellen.
    4. WICHTIG: Erstelle eine detaillierte 'README.md' im Ordner {work_dir}, die genau erklärt, wie man das Projekt installiert und startet.

    Arbeite autonom, schreibe die Dateien direkt in das Verzeichnis. Beende deine Arbeit erst, wenn alle Dateien generiert wurden.
    """

    config_dir = os.path.join(openmanus_dir, "config")
    os.makedirs(config_dir, exist_ok=True)
    config_path = os.path.join(config_dir, "config.toml")

    # Using Google's OpenAI compatibility layer
    toml_content = f"""
[llm]
model = "{model}"
base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"
api_key = "{apiKey}"
max_tokens = 8192
temperature = 0.4
"""
    with open(config_path, "w") as f:
        f.write(toml_content)

    print(f"Starting OpenManus for session {session_id}...")

    try:
        process = await asyncio.create_subprocess_exec(
            "python", "main.py", "--prompt", prompt,
            cwd=openmanus_dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()
        print(f"OpenManus Process Finished. Code: {process.returncode}")

        # We can dump stdout for logging/debugging if needed:
        # print("OpenManus STDOUT:", stdout.decode("utf-8", errors="ignore"))
        # print("OpenManus STDERR:", stderr.decode("utf-8", errors="ignore"))

    except Exception as e:
        print(f"Error running OpenManus: {e}")
        shutil.rmtree(openmanus_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))

    zip_path = os.path.join(os.getcwd(), f"project_{session_id}.zip")

    def zipdir(path, ziph):
        for root, dirs, files in os.walk(path):
            for file in files:
                ziph.write(os.path.join(root, file),
                           os.path.relpath(os.path.join(root, file),
                                           os.path.join(path, '..')))

    zipf = zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED)
    zipdir(work_dir, zipf)
    zipf.close()

    # Clean up workspace folder immediately
    shutil.rmtree(work_dir, ignore_errors=True)
    shutil.rmtree(openmanus_dir, ignore_errors=True)

    background_tasks.add_task(cleanup_files, "", zip_path)

    # Return the zip file
    return FileResponse(zip_path, media_type="application/zip", filename="openmanus_project.zip")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
