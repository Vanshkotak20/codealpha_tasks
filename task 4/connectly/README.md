# Connectly — Real-Time Video Conferencing & Collaboration

A full-stack real-time communication app built for CodeAlpha Task 4.

## Features
- 🎥 **Multi-user Video Calling** — WebRTC peer-to-peer video with dynamic grid layout
- 🖥️ **Screen Sharing** — Share your screen with all participants
- 📁 **File Sharing** — Upload and share files (up to 50MB) in-room
- ✏️ **Collaborative Whiteboard** — Draw, sketch, write with sync across all users (pen, eraser, shapes, text)
- 💬 **Real-Time Chat** — In-room messaging with unread badge
- 👥 **Participants Panel** — See who's in the room
- 🔒 **Authentication** — JWT + bcrypt secure auth
- 🔑 **Password-Protected Rooms** — Optional room passwords
- 🌐 **Data Encryption** — HTTPS-ready, helmet security headers

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Real-Time | Socket.io |
| Video | WebRTC (peer-to-peer) |
| Auth | JWT + bcryptjs |
| Database | NeDB (file-based, zero setup) |
| Frontend | Vanilla HTML/CSS/JS SPA |

## Setup & Run

```bash
# 1. Install dependencies
npm install

# 2. Start the server
node server.js

# 3. Open in browser
# http://localhost:3000
```

## How to Use
1. **Register** an account or **Sign In**
2. **Create a Room** — optionally add a name and password
3. **Share the Room Code** with others (click to copy)
4. **Join** — click the code field to copy it, paste it in the Join field
5. Use the toolbar to toggle **video**, **mic**, **screen share**
6. Switch panels: **Videos | Whiteboard | Files | Chat**

## Project Structure
```
connectly/
├── server.js          # Express + Socket.io backend
├── package.json
├── data/              # NeDB databases (auto-created)
├── uploads/           # Uploaded files (auto-created)
└── public/
    ├── index.html     # SPA entry point
    ├── css/style.css  # Dark theme UI
    └── js/app.js      # Frontend logic (WebRTC, sockets, whiteboard)
```
