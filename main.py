"""Dynasty AI GM — CLI entry point."""
import uuid
import typer
from rich.console import Console
from rich.markdown import Markdown
from langchain_core.messages import HumanMessage

app = typer.Typer()
console = Console()


def _get_graph():
    from langgraph.checkpoint.memory import MemorySaver
    from src.graph.dynasty_graph import _build_graph
    return _build_graph(checkpointer=MemorySaver())


_graph = None


def _run(question: str, thread_id: str, echo: bool = True):
    global _graph
    if _graph is None:
        _graph = _get_graph()

    config = {"configurable": {"thread_id": thread_id}}
    if echo:
        console.print(f"\n[bold cyan]You:[/bold cyan] {question}\n")
    result = _graph.invoke(
        {
            "messages": [HumanMessage(content=question)],
            "agent": "",
            "plan": [],
            "plan_index": 0,
        },
        config=config,
    )
    last_message = result["messages"][-1]
    console.print("[bold green]Dynasty GM:[/bold green]")
    console.print(Markdown(last_message.content))
    console.print()


@app.command()
def ask(
    question: str = typer.Argument(
        ..., help="Your dynasty fantasy football question"
    ),
):
    """Ask the Dynasty AI GM a single question."""
    _run(question, thread_id=str(uuid.uuid4()))


@app.command()
def chat():
    """Start an interactive chat session with the Dynasty AI GM."""
    thread_id = str(uuid.uuid4())
    console.print(
        "[bold]Dynasty AI GM[/bold] — "
        "type [italic]exit[/italic] or [italic]quit[/italic] to stop.\n"
    )
    while True:
        try:
            question = console.input("[bold cyan]You:[/bold cyan] ").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\nGoodbye!")
            break
        if not question:
            continue
        if question.lower() in ("exit", "quit"):
            console.print("Goodbye!")
            break
        _run(question, thread_id=thread_id, echo=False)


if __name__ == "__main__":
    app()
