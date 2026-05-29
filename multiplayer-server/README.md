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

Or connect to: 'http://127.0.0.1:5500/HTML/mainmenu.html'

## 4) Open the game in multiplayer mode
Use this URL:

`HTML/arena.html?multiplayer=1`

Or click **ARENA MULTIPLAYER (2P)** in the main menu.

## 5) Test with 2 or more players
Open as many browser windows/tabs as you want and join multiplayer mode from all of them.

Para borrar la leaderboard has `localStorage.removeItem('crownfall_leaderboard')` en la consola del navegador.  


