import subprocess
import os
import sys
import signal
import time
import platform

IS_WINDOWS = platform.system() == "Windows"


def main():
    port = int(os.environ.get("PORT", "5000"))
    api_port = 5001
    workspace = os.path.dirname(os.path.abspath(__file__))

    npx_cmd = "npx.cmd" if IS_WINDOWS else "npx"

    api_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "server_py.main:app",
         "--host", "0.0.0.0", "--port", str(api_port), "--reload",
         "--reload-dir", "server_py"],
        cwd=workspace,
    )

    time.sleep(2)

    vite_process = subprocess.Popen(
        [npx_cmd, "vite", "--port", str(port), "--host", "0.0.0.0", "--strictPort"],
        cwd=workspace,
        env={**os.environ, "NODE_ENV": "development"},
    )

    print(f"Python API server on port {api_port}")
    print(f"Vite dev server on port {port} (proxying /api to {api_port})")

    def cleanup(sig=None, frame=None):
        vite_process.terminate()
        api_process.terminate()
        try:
            vite_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            vite_process.kill()
        try:
            api_process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            api_process.kill()
        sys.exit(0)

    signal.signal(signal.SIGINT, cleanup)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, cleanup)

    try:
        while True:
            if vite_process.poll() is not None:
                print("Vite process died, restarting...")
                vite_process = subprocess.Popen(
                    [npx_cmd, "vite", "--port", str(port), "--host", "0.0.0.0", "--strictPort"],
                    cwd=workspace,
                    env={**os.environ, "NODE_ENV": "development"},
                )
            if api_process.poll() is not None:
                print("API process died, restarting...")
                api_process = subprocess.Popen(
                    [sys.executable, "-m", "uvicorn", "server_py.main:app",
                     "--host", "0.0.0.0", "--port", str(api_port), "--reload",
                     "--reload-dir", "server_py"],
                    cwd=workspace,
                )
            time.sleep(2)
    except KeyboardInterrupt:
        cleanup()


if __name__ == "__main__":
    main()
