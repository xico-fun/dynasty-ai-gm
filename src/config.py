from dotenv import load_dotenv
import os

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
SLEEPER_USERNAME = os.getenv("SLEEPER_USERNAME")
SLEEPER_LEAGUE_ID = os.getenv("SLEEPER_LEAGUE_ID")
ODDS_API_KEY = os.getenv("ODDS_API_KEY")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")

# LangSmith tracing (optional — set in .env to enable)
LANGCHAIN_TRACING_V2 = os.getenv("LANGCHAIN_TRACING_V2", "false")
LANGCHAIN_API_KEY = os.getenv("LANGCHAIN_API_KEY", "")
LANGCHAIN_PROJECT = os.getenv("LANGCHAIN_PROJECT", "dynasty-ai-gm")

# Export to environment so LangChain picks them up automatically
if LANGCHAIN_TRACING_V2.lower() == "true" and LANGCHAIN_API_KEY:
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_API_KEY"] = LANGCHAIN_API_KEY
    os.environ["LANGCHAIN_PROJECT"] = LANGCHAIN_PROJECT

MISSING = [
    name for name, val in {
        "ANTHROPIC_API_KEY": ANTHROPIC_API_KEY,
        "SLEEPER_USERNAME": SLEEPER_USERNAME,
        "SLEEPER_LEAGUE_ID": SLEEPER_LEAGUE_ID,
        "ODDS_API_KEY": ODDS_API_KEY,
        "TAVILY_API_KEY": TAVILY_API_KEY,
    }.items()
    if not val
]

if MISSING:
    raise EnvironmentError(
        f"Missing required environment variables: {', '.join(MISSING)}\n"
        "Copy .env.example to .env and fill in the values."
    )
