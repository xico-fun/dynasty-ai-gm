# Dynasty AI GM

An AI-powered general manager for your Sleeper dynasty fantasy football league.

Ask it anything — who to start, who to trade, who to pick up off waivers — and it pulls live data from your actual league, real NFL game conditions, Vegas odds, and the latest news to give you a real answer.

## What it does

**Start/Sit Advice**
Get weekly lineup recommendations based on opponent matchup strength, game-day weather for outdoor stadiums, and Vegas player prop lines.

**Trade Analysis**
Tell it a player you want to move and it'll scan every roster in your league for needy teams, pull current dynasty trade values, and suggest realistic trade packages with reasoning.

**Waiver Wire & Free Agents**
It reviews your roster needs, checks trending pickups across the league, and searches for recent NFL news — injuries, depth chart shakeups, opportunity changes — to surface the best available players.

## How it works

Built with LangGraph, the app routes each question to a specialist AI agent (matchup, trade, or waiver) that knows which tools to call and in what order. Data sources include the Sleeper API, Open-Meteo weather, The Odds API for Vegas props, and Tavily for real-time news and dynasty trade values.

## Usage

```bash
# Single question
python main.py ask "Should I start Justin Jefferson or CeeDee Lamb this week?"

# Interactive chat
python main.py chat
```
