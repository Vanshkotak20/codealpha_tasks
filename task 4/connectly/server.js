const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Datastore = require('@seald-io/nedb');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 50 * 1024 * 1024
});

const JWT_SECRET = 'connectly_jwt_secret_2024_secure_key';
const PORT = process.env.PORT || 3000;

// DB setup
const usersDB = new Datastore({ filename: path.join(__dirname, 'data/users.db'), autoload: true });
const roomsDB = new Datastore({ filename: path.join(__dirname, 'data/rooms.db'), autoload: true });
usersDB.ensureIndex({ fieldName: 'email', unique: true });

// Uploads dir
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, uuidv4() + '-' + file.originalname)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  const hash = await bcrypt.hash(password, 12);
  const user = { id: uuidv4(), name, email, password: hash, avatar: name[0].toUpperCase(), createdAt: new Date() };
  usersDB.insert(user, (err) => {
    if (err) return res.status(400).json({ error: 'Email already registered' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar } });
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  usersDB.findOne({ email }, async (err, user) => {
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar } });
  });
});

app.get('/api/me', authMiddleware, (req, res) => {
  usersDB.findOne({ id: req.user.id }, (err, user) => {
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({ id: user.id, name: user.name, email: user.email, avatar: user.avatar });
  });
});

app.post('/api/rooms', authMiddleware, (req, res) => {
  const { name, isPrivate, password } = req.body;
  const roomId = uuidv4().slice(0, 8).toUpperCase();
  const room = { id: roomId, name: name || 'Room ' + roomId, host: req.user.id, isPrivate: !!isPrivate, password: isPrivate && password ? password : null, createdAt: new Date() };
  roomsDB.insert(room, (err, doc) => {
    if (err) return res.status(500).json({ error: 'Failed to create room' });
    res.json({ roomId: doc.id, name: doc.name });
  });
});

app.get('/api/rooms/:roomId', authMiddleware, (req, res) => {
  roomsDB.findOne({ id: req.params.roomId }, (err, room) => {
    if (!room) return res.status(404).json({ error: 'Room not found' });
    res.json({ id: room.id, name: room.name, isPrivate: room.isPrivate, host: room.host });
  });
});

app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ filename: req.file.filename, originalname: req.file.originalname, size: req.file.size, url: '/uploads/' + req.file.filename });
});

// In-memory room state
const rooms = {};
const socketToRoom = {};

function authenticateSocket(socket, next) {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No token'));
  try { socket.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { next(new Error('Invalid token')); }
}

io.use(authenticateSocket);

io.on('connection', (socket) => {
  console.log('Connected:', socket.user.name);

  socket.on('join-room', ({ roomId, password }) => {
    roomsDB.findOne({ id: roomId }, (err, room) => {
      if (!room) { socket.emit('room-error', 'Room not found'); return; }
      if (room.isPrivate && room.password && room.password !== password) { socket.emit('room-error', 'Wrong room password'); return; }
      if (!rooms[roomId]) rooms[roomId] = { host: room.host, permissions: { speak: true, draw: true, screen: true, chat: true }, permissionOverrides: {}, participants: new Map(), whiteboard: [], chat: [], files: [] };
      const participant = { id: socket.user.id, name: socket.user.name, avatar: socket.user.name[0].toUpperCase(), socketId: socket.id };
      rooms[roomId].participants.set(socket.id, participant);
      socketToRoom[socket.id] = roomId;
      socket.join(roomId);
      const others = [...rooms[roomId].participants.entries()].filter(([sid]) => sid !== socket.id).map(([, p]) => p);
      socket.emit('room-joined', { roomId, room: { id: room.id, name: room.name, host: room.host, createdAt: room.createdAt }, permissions: rooms[roomId].permissions, permissionOverrides: rooms[roomId].permissionOverrides, participants: others, whiteboard: rooms[roomId].whiteboard, chat: rooms[roomId].chat, files: rooms[roomId].files });
      socket.to(roomId).emit('user-joined', participant);
    });
  });

  socket.on('offer', ({ to, offer }) => { io.to(to).emit('offer', { from: socket.id, offer, user: rooms[socketToRoom[socket.id]]?.participants.get(socket.id) }); });
  socket.on('answer', ({ to, answer }) => { io.to(to).emit('answer', { from: socket.id, answer }); });
  socket.on('ice-candidate', ({ to, candidate }) => { io.to(to).emit('ice-candidate', { from: socket.id, candidate }); });

  socket.on('chat-message', ({ roomId, message }) => {
    const room = rooms[roomId]; if (!room) return;
    if (!room.permissions.chat && socket.user.id !== room.host) return;
    const participant = room.participants.get(socket.id);
    const msg = { id: uuidv4(), text: message, sender: participant, timestamp: new Date().toISOString() };
    room.chat.push(msg); if (room.chat.length > 200) room.chat.shift();
    io.to(roomId).emit('chat-message', msg);
  });

  socket.on('update-permissions', ({ roomId, permissions }) => {
    const room = rooms[roomId]; if (!room) return;
    if (socket.user.id !== room.host) return; // Only host
    room.permissions = { ...room.permissions, ...permissions };
    io.to(roomId).emit('permissions-updated', room.permissions);
  });

  socket.on('update-user-permission', ({ roomId, targetSocketId, permission, value }) => {
    const room = rooms[roomId]; if (!room) return;
    if (socket.user.id !== room.host) return; // Only host
    if (!room.permissionOverrides[targetSocketId]) room.permissionOverrides[targetSocketId] = {};
    room.permissionOverrides[targetSocketId][permission] = value;
    io.to(roomId).emit('user-permission-updated', { targetSocketId, permission, value });
  });

  socket.on('whiteboard-draw', ({ roomId, data }) => {
    const room = rooms[roomId]; if (!room) return;
    if (!room.permissions.draw && socket.user.id !== room.host) return;
    room.whiteboard.push(data);
    socket.to(roomId).emit('whiteboard-draw', data);
  });

  socket.on('whiteboard-clear', ({ roomId }) => {
    const room = rooms[roomId]; if (!room) return;
    if (!room.permissions.draw && socket.user.id !== room.host) return;
    room.whiteboard = [];
    io.to(roomId).emit('whiteboard-clear');
  });

  socket.on('file-shared', ({ roomId, file }) => {
    const room = rooms[roomId]; if (!room) return;
    const participant = room.participants.get(socket.id);
    const fileData = { ...file, sharedBy: participant, timestamp: new Date().toISOString() };
    room.files.push(fileData);
    io.to(roomId).emit('file-shared', fileData);
  });

  socket.on('screen-share-started', ({ roomId }) => {
    const room = rooms[roomId]; if (!room) return;
    if (!room.permissions.screen && socket.user.id !== room.host) return;
    const participant = room.participants.get(socket.id);
    socket.to(roomId).emit('screen-share-started', { socketId: socket.id, user: participant });
  });

  socket.on('screen-share-stopped', ({ roomId }) => {
    socket.to(roomId).emit('screen-share-stopped', { socketId: socket.id });
  });

  socket.on('disconnect', () => {
    const roomId = socketToRoom[socket.id];
    if (roomId && rooms[roomId]) {
      rooms[roomId].participants.delete(socket.id);
      socket.to(roomId).emit('user-left', { socketId: socket.id, userId: socket.user.id });
      if (rooms[roomId].participants.size === 0) delete rooms[roomId];
    }
    delete socketToRoom[socket.id];
    console.log('Disconnected:', socket.user.name);
  });
});

server.listen(PORT, () => console.log('Connectly running on http://localhost:' + PORT));
