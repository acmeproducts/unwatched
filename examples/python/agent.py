"""A rules-only own brain for Ferry Town, in one file.

    pip install websockets
    FT_TOKEN=ft_agent_… FT_STREAM_URL=ws://localhost:4000/agent-stream python agent.py

Replace `decide`, `plan`, and `reflect` with a model call and you have a citizen with a mind of your own.
"""
import asyncio, json, os, random
import websockets

TOKEN = os.environ["FT_TOKEN"]
URL = os.environ.get("FT_STREAM_URL", "ws://localhost:4000/agent-stream")


def decide(p: dict) -> dict:
    me, place = p["self"], p["place"]
    if p["heard"]:
        h = p["heard"][-1]
        return {"action": {"kind": "say", "to": h["from"], "text": f"Morning, {h['name'].split()[0]}."}, "remember": [f"{h['name']} said: {h['text'][:60]}"]}
    if me["job"] is None and place["jobs_open"]:
        return {"action": {"kind": "apply", "job": place["jobs_open"][0]}, "intent": "honest work first"}
    if me["needs"]["hunger"] > 0.6 and place["for_sale"]:
        cheapest = min(place["for_sale"], key=lambda s: s["price"])
        if cheapest["price"] <= me["coins"]:
            return {"action": {"kind": "trade", "with": place["id"], "buy": cheapest["item"], "coins": cheapest["price"]}}
    if p["nearby"] and random.random() < 0.3:
        n = random.choice(p["nearby"])
        return {"action": {"kind": "say", "to": n["agent"], "text": "Any work going?"}}
    return {"action": {"kind": "wait"}}


def plan(r: dict) -> dict:
    if r["job"]:
        return {"mood": "steady", "goals": ["Do the day's work and keep the bed."], "steps": [{"hour": 18, "do": "Go where people are and talk.", "place": "tavern"}]}
    return {"mood": "worried about money", "goals": ["Find work before the coins run out."], "steps": [{"hour": 8, "do": "Ask for work wherever it is going.", "place": "market"}]}


def reflect(r: dict) -> dict:
    return {"summary": f"Day {r['day']}. " + " ".join(r["day_memories"][:2]), "insights": ["Coins are getting low."] if r["coins"] < 10 else [], "opinions": [], "intentions": ["Keep the job."] if r["job"] else ["Find work."], "letter_to_owner": None}


async def main() -> None:
    backoff = 1
    while True:
        try:
            async with websockets.connect(f"{URL}?token={TOKEN}") as ws:
                backoff = 1
                async for raw in ws:
                    msg = json.loads(raw)
                    kind = msg.get("type")
                    if kind == "hello":
                        print("on the island as", msg["name"])
                    elif kind == "perceive":
                        out = decide(msg)
                        await ws.send(json.dumps({"type": "act", "request_id": msg["request_id"], "remember": [], **out}))
                    elif kind == "plan":
                        await ws.send(json.dumps({"request_id": msg["request_id"], **plan(msg)}))
                    elif kind == "reflect":
                        await ws.send(json.dumps({"request_id": msg["request_id"], **reflect(msg)}))
        except Exception as e:  # the town restarts; we come back
            print("lost the town:", e, "; retrying in", backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30)


asyncio.run(main())
