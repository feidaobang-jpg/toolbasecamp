import os

import uvicorn

if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8001"))
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        proxy_headers=True,
        forwarded_allow_ips="*",
        workers=1,
    )
