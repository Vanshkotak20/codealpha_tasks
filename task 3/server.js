const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const Datastore = require('@seald-io/nedb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');

const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Datastores
const db = {};
db.users = new Datastore({ filename: path.join(__dirname, 'data', 'users.db'), autoload: true });
db.boards = new Datastore({ filename: path.join(__dirname, 'data', 'boards.db'), autoload: true });
db.tasks = new Datastore({ filename: path.join(__dirname, 'data', 'tasks.db'), autoload: true });
db.comments = new Datastore({ filename: path.join(__dirname, 'data', 'comments.db'), autoload: true });
db.chats = new Datastore({ filename: path.join(__dirname, 'data', 'chats.db'), autoload: true });
db.notifications = new Datastore({ filename: path.join(__dirname, 'data', 'notifications.db'), autoload: true });
db.files = new Datastore({ filename: path.join(__dirname, 'data', 'files.db'), autoload: true });

const JWT_SECRET = 'supersecretkey_taskhive'; // In production, use environment variables

// Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'uploads')),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// --- Middleware for Auth ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token == null) return res.status(401).json({ error: 'Token required' });
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// --- Routes ---

// Auth
app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    
    db.users.findOne({ username }, (err, existingUser) => {
        if (err) {
            console.error('Find error:', err);
            return res.status(500).json({ error: 'Database error during find' });
        }
        if (existingUser) return res.status(400).json({ error: 'Username already taken' });
        
        const hashedPassword = bcrypt.hashSync(password, 8);
        db.users.insert({ username, password: hashedPassword }, (err, newUser) => {
            if (err) {
                console.error('Insert error:', err);
                return res.status(500).json({ error: 'Database error during insert' });
            }
            res.status(201).json({ message: 'User registered successfully' });
        });
    });
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    db.users.findOne({ username }, (err, user) => {
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        
        const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET);
        res.json({ token, username: user.username, id: user._id, avatarUrl: user.avatarUrl });
    });
});

// Users
app.get('/api/users/me', authenticateToken, (req, res) => {
    db.users.findOne({ _id: req.user.id }, { password: 0 }, (err, user) => {
        res.json(user);
    });
});

app.post('/api/users/profile', authenticateToken, upload.single('avatar'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const avatarUrl = '/uploads/' + req.file.filename;
    db.users.update({ _id: req.user.id }, { $set: { avatarUrl } }, {}, (err, numReplaced) => {
        res.json({ avatarUrl });
    });
});

// Users
app.get('/api/users', authenticateToken, (req, res) => {
    db.users.find({}, { password: 0 }, (err, users) => {
        res.json(users);
    });
});

// Boards (We'll use a single global board for simplicity in this prototype as asked in plan questions if they don't respond, we just provide a default one or allow creating)
app.get('/api/boards', authenticateToken, (req, res) => {
    db.boards.find({ isArchived: { $ne: true }, $or: [{ members: req.user.id }, { ownerId: 'system' }] }, (err, boards) => {
        res.json(boards);
    });
});

app.get('/api/boards/archived', authenticateToken, (req, res) => {
    db.boards.find({ isArchived: true, $or: [{ members: req.user.id }, { ownerId: 'system' }] }, (err, boards) => {
        res.json(boards);
    });
});

app.post('/api/boards', authenticateToken, (req, res) => {
    const { name } = req.body;
    const newBoard = {
        name,
        ownerId: req.user.id,
        members: [req.user.id],
        roles: { [req.user.id]: 'owner' },
        isArchived: false
    };
    db.boards.insert(newBoard, (err, b) => {
        res.status(201).json(b);
    });
});

app.post('/api/boards/:id/unarchive', authenticateToken, (req, res) => {
    db.boards.findOne({ _id: req.params.id }, (err, board) => {
        if (!board || (board.roles?.[req.user.id] !== 'owner' && board.roles?.[req.user.id] !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        db.boards.update({ _id: req.params.id }, { $set: { isArchived: false } }, {}, () => {
            res.json({ success: true });
        });
    });
});

app.post('/api/boards/:id/members', authenticateToken, (req, res) => {
    const { username, role } = req.body;
    db.boards.findOne({ _id: req.params.id }, (err, board) => {
        if (!board || (board.roles?.[req.user.id] !== 'owner' && board.roles?.[req.user.id] !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        db.users.findOne({ username }, (err, userToAdd) => {
            if (!userToAdd) return res.status(404).json({ error: 'User not found' });
            if (board.members && board.members.includes(userToAdd._id)) return res.status(400).json({ error: 'User already in board' });
            
            const updatedRoles = { ...(board.roles || {}), [userToAdd._id]: role || 'member' };
            db.boards.update(
                { _id: req.params.id }, 
                { $push: { members: userToAdd._id }, $set: { roles: updatedRoles } },
                { returnUpdatedDocs: true },
                (err, numReplaced, updatedBoard) => {
                    io.to(req.params.id).emit('board-updated', updatedBoard);
                    res.json(updatedBoard);
                }
            );
        });
    });
});

app.delete('/api/boards/:id/members/:userId', authenticateToken, (req, res) => {
    db.boards.findOne({ _id: req.params.id }, (err, board) => {
        if (!board || board.roles?.[req.user.id] !== 'owner') {
            return res.status(403).json({ error: 'Only owners can remove members' });
        }
        if (req.params.userId === board.ownerId) return res.status(400).json({ error: 'Cannot remove owner' });
        
        const updatedRoles = { ...(board.roles || {}) };
        delete updatedRoles[req.params.userId];
        
        db.boards.update(
            { _id: req.params.id },
            { $pull: { members: req.params.userId }, $set: { roles: updatedRoles } },
            { returnUpdatedDocs: true },
            (err, numReplaced, updatedBoard) => {
                io.to(req.params.id).emit('board-updated', updatedBoard);
                res.json({ success: true });
            }
        );
    });
});

app.post('/api/boards/:id/archive', authenticateToken, (req, res) => {
    db.boards.findOne({ _id: req.params.id }, (err, board) => {
        if (!board || (board.roles?.[req.user.id] !== 'owner' && board.roles?.[req.user.id] !== 'admin')) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        db.boards.update({ _id: req.params.id }, { $set: { isArchived: true } }, {}, () => {
            res.json({ success: true });
        });
    });
});

app.put('/api/boards/:id/roles', authenticateToken, (req, res) => {
    const { targetUserId, newRole } = req.body; // 'admin' or 'member'
    db.boards.findOne({ _id: req.params.id }, (err, board) => {
        if (!board || board.roles?.[req.user.id] !== 'owner') {
            return res.status(403).json({ error: 'Only owners can change roles' });
        }
        const updatedRoles = { ...(board.roles || {}), [targetUserId]: newRole };
        db.boards.update({ _id: req.params.id }, { $set: { roles: updatedRoles } }, { returnUpdatedDocs: true }, (err, numReplaced, updatedBoard) => {
            io.to(req.params.id).emit('board-updated', updatedBoard);
            res.json({ success: true, roles: updatedRoles });
        });
    });
});

// Tasks
app.get('/api/boards/:boardId/tasks', authenticateToken, (req, res) => {
    db.tasks.find({ boardId: req.params.boardId }, (err, tasks) => {
        res.json(tasks);
    });
});

app.post('/api/tasks', authenticateToken, (req, res) => {
    const { title, description, boardId, status, assigneeId } = req.body;
    const task = {
        title,
        description: description || '',
        boardId,
        status: status || 'To Do',
        assigneeId: assigneeId || null,
        createdBy: req.user.id,
        createdAt: new Date()
    };
    db.tasks.insert(task, (err, newTask) => {
        io.to(boardId).emit('task-created', newTask);
        res.status(201).json(newTask);
    });
});

app.patch('/api/tasks/:id', authenticateToken, (req, res) => {
    const { boardId, ...updates } = req.body;
    db.tasks.update({ _id: req.params.id }, { $set: updates }, { returnUpdatedDocs: true }, (err, numReplaced, updatedTask) => {
        if (updatedTask) {
             io.to(boardId).emit('task-updated', updatedTask);
             res.json(updatedTask);
        } else {
             res.status(404).json({ error: 'Task not found' });
        }
    });
});

app.put('/api/tasks/:id', authenticateToken, (req, res) => {
    const { title, description, status, assigneeId, boardId } = req.body;
    
    db.tasks.update({ _id: req.params.id }, { $set: { title, description, status, assigneeId } }, { returnUpdatedDocs: true }, (err, numReplaced, updatedTask) => {
        if (updatedTask) {
             io.to(boardId).emit('task-updated', updatedTask);
             res.json(updatedTask);
        } else {
             res.status(404).json({ error: 'Task not found' });
        }
    });
});

app.delete('/api/tasks/:id', authenticateToken, (req, res) => {
    const boardId = req.query.boardId;
    db.tasks.remove({ _id: req.params.id }, {}, (err, numRemoved) => {
        if (numRemoved > 0) {
            io.to(boardId).emit('task-deleted', req.params.id);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Task not found' });
        }
    });
});

// Comments
app.get('/api/tasks/:taskId/comments', authenticateToken, (req, res) => {
    db.comments.find({ taskId: req.params.taskId }).sort({ createdAt: 1 }).exec((err, comments) => {
        res.json(comments);
    });
});

app.post('/api/tasks/:taskId/comments', authenticateToken, (req, res) => {
    const { text, boardId } = req.body;
    const comment = {
        taskId: req.params.taskId,
        userId: req.user.id,
        username: req.user.username,
        text,
        createdAt: new Date()
    };
    
    db.comments.insert(comment, (err, newComment) => {
        io.to(boardId).emit('comment-added', newComment);
        
        // Handle @mentions
        const mentionRegex = /@(\w+)/g;
        let match;
        while ((match = mentionRegex.exec(text)) !== null) {
            const mentionedUsername = match[1];
            db.users.findOne({ username: mentionedUsername }, (err, mUser) => {
                if (mUser) {
                    const notif = {
                        userId: mUser._id,
                        text: `${req.user.username} mentioned you in a comment`,
                        createdAt: new Date(),
                        read: false
                    };
                    db.notifications.insert(notif, (err, n) => {
                        io.to(mUser._id).emit('new-notification', n);
                    });
                }
            });
        }
        
        res.status(201).json(newComment);
    });
});

// Files (Boards)
app.post('/api/boards/:id/files', authenticateToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const fileRecord = {
        boardId: req.params.id,
        filename: req.file.originalname,
        url: '/uploads/' + req.file.filename,
        uploadedBy: req.user.username,
        createdAt: new Date()
    };
    db.files.insert(fileRecord, (err, f) => {
        io.to(req.params.id).emit('file-uploaded', f);
        res.status(201).json(f);
    });
});

app.get('/api/boards/:id/files', authenticateToken, (req, res) => {
    db.files.find({ boardId: req.params.id }, (err, files) => {
        res.json(files);
    });
});

// Files (Tasks)
app.post('/api/tasks/:id/files', authenticateToken, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const fileRecord = {
        taskId: req.params.id,
        filename: req.file.originalname,
        url: '/uploads/' + req.file.filename,
        uploadedBy: req.user.username,
        createdAt: new Date()
    };
    db.files.insert(fileRecord, (err, f) => {
        res.status(201).json(f);
    });
});

app.get('/api/tasks/:id/files', authenticateToken, (req, res) => {
    db.files.find({ taskId: req.params.id }, (err, files) => {
        res.json(files);
    });
});

// Chat
app.get('/api/boards/:id/chat', authenticateToken, (req, res) => {
    db.chats.find({ boardId: req.params.id }).sort({ createdAt: 1 }).exec((err, messages) => {
        res.json(messages);
    });
});

app.post('/api/boards/:id/chat', authenticateToken, (req, res) => {
    const msg = {
        boardId: req.params.id,
        userId: req.user.id,
        username: req.user.username,
        text: req.body.text,
        createdAt: new Date()
    };
    db.chats.insert(msg, (err, newMsg) => {
        io.to(req.params.id).emit('chat-message', newMsg);
        res.status(201).json(newMsg);
    });
});

// Notifications
app.get('/api/notifications', authenticateToken, (req, res) => {
    db.notifications.find({ userId: req.user.id }).sort({ createdAt: -1 }).exec((err, notifs) => {
        res.json(notifs);
    });
});

app.put('/api/notifications/read', authenticateToken, (req, res) => {
    db.notifications.update({ userId: req.user.id }, { $set: { read: true } }, { multi: true }, () => {
        res.json({ success: true });
    });
});


// --- Socket.io ---
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return next(new Error('Authentication error'));
        socket.user = user;
        next();
    });
});

const onlineUsersByBoard = {}; // boardId -> Map of userId -> {id, username, avatarUrl}

function emitOnlineUsers(boardId) {
    if (!onlineUsersByBoard[boardId]) return;
    const usersList = Array.from(onlineUsersByBoard[boardId].values());
    io.to(boardId).emit('users-online', usersList);
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.username}`);
    let currentBoard = null;
    
    socket.on('join-board', (boardId) => {
        if (currentBoard) {
            socket.leave(currentBoard);
            if (onlineUsersByBoard[currentBoard]) {
                onlineUsersByBoard[currentBoard].delete(socket.user.id);
                emitOnlineUsers(currentBoard);
            }
        }

        socket.join(boardId);
        // Also join personal room for notifications
        socket.join(socket.user.id);
        currentBoard = boardId;

        if (!onlineUsersByBoard[boardId]) onlineUsersByBoard[boardId] = new Map();
        
        db.users.findOne({ _id: socket.user.id }, (err, user) => {
            onlineUsersByBoard[boardId].set(socket.user.id, {
                id: socket.user.id,
                username: socket.user.username,
                avatarUrl: user ? user.avatarUrl : null
            });
            emitOnlineUsers(boardId);
        });

        console.log(`User ${socket.user.username} joined board ${boardId}`);
    });
    
    socket.on('typing', (boardId) => {
        socket.to(boardId).emit('user-typing', socket.user.username);
    });

    socket.on('typing-chat', (boardId) => {
        socket.to(boardId).emit('user-typing-chat', socket.user.username);
    });
    
    socket.on('leave-board', (boardId) => {
        socket.leave(boardId);
        if (onlineUsersByBoard[boardId]) {
            onlineUsersByBoard[boardId].delete(socket.user.id);
            emitOnlineUsers(boardId);
        }
        if (currentBoard === boardId) currentBoard = null;
    });
    
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.user.username}`);
        if (currentBoard && onlineUsersByBoard[currentBoard]) {
            onlineUsersByBoard[currentBoard].delete(socket.user.id);
            emitOnlineUsers(currentBoard);
        }
    });
});

// Init Default Board
db.boards.findOne({ name: 'General Project' }, (err, board) => {
    if (!board) {
        db.boards.insert({ name: 'General Project', ownerId: 'system', members: [], roles: { 'system': 'owner' }, isArchived: false });
    }
});

const PORT = process.env.PORT || 4500;
server.listen(PORT, () => {
    console.log(`TaskHive server running on port ${PORT}`);
});
