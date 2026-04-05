from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import uvicorn
import os
import shutil
import uuid
import zipfile
import asyncio

# CrewAI imports
from crewai import Agent, Task, Crew, Process, LLM
from crewai.tools import tool

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
async def run_crewai(
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

    # Define a tool for CrewAI to write files to the workspace
    @tool("Write File Tool")
    def write_file_tool(filename: str, content: str) -> str:
        """Write content to a file in the project workspace.
        Use this to create HTML, JS, CSS, Python, Markdown, or any other necessary files.
        Important: You must only provide the filename (e.g. 'index.html', 'assets.md'), not a full path.
        """
        # Ensure safe path
        safe_filename = os.path.basename(filename)
        path = os.path.join(work_dir, safe_filename)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return f"Successfully wrote {safe_filename}."

    # Configure the Gemini LLM
    gemini_llm = LLM(
        model=f"gemini/{model}",
        api_key=apiKey
    )

    # Agent: Game Designer / Architect
    designer = Agent(
        role='Lead Game and Software Architect',
        goal='Design the complete architecture, UI/UX, and asset requirements based on user specifications.',
        backstory='You are a world-class system architect and game designer. You excel at translating vague ideas into concrete technical blueprints and asset lists.',
        verbose=True,
        allow_delegation=False,
        llm=gemini_llm,
        tools=[write_file_tool]
    )

    # Agent: Fullstack Developer
    developer = Agent(
        role='Senior Fullstack Engineer',
        goal='Write clean, functional code (HTML/CSS/JS or Python) to implement the software/game design.',
        backstory='You are an expert programmer who writes flawless, efficient code. You always follow best practices and integrate assets correctly.',
        verbose=True,
        allow_delegation=False,
        llm=gemini_llm,
        tools=[write_file_tool]
    )

    # Task 1: Analyze & Write Documentation
    task_docs = Task(
        description=f"""
        Analyze the following idea and requirements:
        Idea: {idea}
        Additional Info: {additionalInfo}
        {file_content}

        Your job:
        1. Design the application/game.
        2. Use the Write File Tool to create an 'assets.md' file. This file MUST list every single graphical or audio asset the game will need (e.g. background, player sprite, jump sound).
           Each line in 'assets.md' MUST include: The filename, the relative path (e.g. ./assets/images/player.png), and the exact required dimensions/size (e.g. 32x32px or 5 seconds).
        3. Use the Write File Tool to create a 'README.md' file that explains exactly how to install and run the project.
        """,
        expected_output="Confirmation that assets.md and README.md have been successfully written to the workspace.",
        agent=designer
    )

    # Task 2: Write the Code
    task_code = Task(
        description="""
        Based on the architect's design, write the actual functional code for the application/game.
        Use the Write File Tool to create all necessary source code files (e.g., 'index.html', 'style.css', 'game.js', or equivalent).
        Ensure all references to graphics or sounds point to the exact relative paths defined in the assets.md file.
        The game/software must be fully functional.
        """,
        expected_output="Confirmation that all source code files have been written to the workspace.",
        agent=developer
    )

    crew = Crew(
        agents=[designer, developer],
        tasks=[task_docs, task_code],
        verbose=True,
        process=Process.sequential
    )

    print(f"Starting CrewAI for session {session_id}...")
    try:
        # Run the crew synchronously in a thread block since CrewAI execution is blocking
        await asyncio.to_thread(crew.kickoff)
        print("CrewAI Process Finished successfully.")
    except Exception as e:
        print(f"Error running CrewAI: {e}")
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"CrewAI Error: {str(e)}")

    # Zip the workspace folder
    zip_path = os.path.join(os.getcwd(), f"project_{session_id}.zip")

    def zipdir(path, ziph):
        for root, dirs, files in os.walk(path):
            for file in files:
                ziph.write(os.path.join(root, file),
                           os.path.relpath(os.path.join(root, file),
                                           os.path.join(path, '..')))

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        zipdir(work_dir, zipf)

    # Clean up workspace folder immediately
    shutil.rmtree(work_dir, ignore_errors=True)

    # Schedule zip file deletion after download
    background_tasks.add_task(cleanup_files, "", zip_path)

    return FileResponse(zip_path, media_type="application/zip", filename="crewai_project.zip")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
