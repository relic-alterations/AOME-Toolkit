import asyncio
from app.core.worker import run_transfer_job

async def main():
    print("starting")
    try:
        await run_transfer_job(38)
    except Exception as e:
        print(f"Error: {e}")
    print("done")

asyncio.run(main())
