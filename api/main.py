"""Dynasty AI GM — FastAPI backend."""
import uuid
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from pydantic import BaseModel

from src.graph.dynasty_graph import _build_graph
from src.tools.sleeper_tools import _build_enriched_rosters

app = FastAPI(title="Dynasty AI GM API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Single shared graph instance with in-memory checkpointing
_graph = _build_graph(checkpointer=MemorySaver())


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None  # omit to start a new thread


class ChatResponse(BaseModel):
    thread_id: str
    response: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"ok": True}


@app.get("/roster")
def get_roster():
    """Return all enriched rosters for the league."""
    try:
        return _build_enriched_rosters()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    """Send a message and get a full response (non-streaming)."""
    thread_id = req.thread_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}
    result = _graph.invoke(
        {
            "messages": [HumanMessage(content=req.message)],
            "agent": "",
            "plan": [],
            "plan_index": 0,
        },
        config=config,
    )
    last = result["messages"][-1]
    return ChatResponse(thread_id=thread_id, response=last.content)


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """Send a message and stream the response token by token."""
    thread_id = req.thread_id or str(uuid.uuid4())
    config = {"configurable": {"thread_id": thread_id}}

    async def token_stream() -> AsyncIterator[str]:
        # Send thread_id first so the client can persist it
        yield f"data: {{\"thread_id\": \"{thread_id}\"}}\n\n"

        async for event in _graph.astream_events(
            {
                "messages": [HumanMessage(content=req.message)],
                "agent": "",
                "plan": [],
                "plan_index": 0,
            },
            config=config,
            version="v2",
        ):
            kind = event.get("event")
            # Stream tokens from the final AI response
            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                if chunk.content:
                    text = chunk.content
                    if isinstance(text, list):
                        text = "".join(
                            b.get("text", "") for b in text
                            if isinstance(b, dict)
                        )
                    if text:
                        yield f"data: {{\"token\": {repr(text)}}}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        token_stream(),
        media_type="text/event-stream",
        headers={"X-Thread-Id": thread_id},
    )


@app.get("/thread/{thread_id}/history")
def get_thread_history(thread_id: str):
    """Return the message history for a given thread."""
    config = {"configurable": {"thread_id": thread_id}}
    state = _graph.get_state(config)
    if not state or not state.values:
        return {"thread_id": thread_id, "messages": []}

    messages = []
    for msg in state.values.get("messages", []):
        role = "user" if isinstance(msg, HumanMessage) else "assistant"
        content = msg.content
        if isinstance(content, list):
            content = "".join(
                b.get("text", "") for b in content if isinstance(b, dict)
            )
        if content:
            messages.append({"role": role, "content": content})

    return {"thread_id": thread_id, "messages": messages}
