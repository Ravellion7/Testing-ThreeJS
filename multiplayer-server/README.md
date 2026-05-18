# Arena Multiplayer (2 Players) - Quick Start

This folder contains a basic WebSocket server for your 2-player Arena mode.

## 1) Install Node.js
Install Node.js LTS from:
https://nodejs.org/

## 2) Install dependencies
From this folder:

```bash
npm install
```

## 3) Start the multiplayer server

```bash
npm start
```

By default, it runs at:

`ws://localhost:8080`

## 4) Open the game in multiplayer mode
Use this URL:

`HTML/arena.html?multiplayer=1`

Or click **ARENA MULTIPLAYER (2P)** in the main menu.

## 5) Test with 2 players
Open two browser windows/tabs and join multiplayer mode from both.

- First player gets slot `p1`
- Second player gets slot `p2`
- Third player gets `room full`

## Notes
- This is a starter implementation.
- Current sync sends only player transform (position + Y rotation).
- Basic server-authoritative hit and damage sync is enabled for rifle shooting between players.
- Wave enemies are disabled while multiplayer mode is active.
- Ammo/reload is still client-side for now.
