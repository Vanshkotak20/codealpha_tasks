// ─── STATE ───
let token = localStorage.getItem('cl_token');
let currentUser = JSON.parse(localStorage.getItem('cl_user') || 'null');
let socket = null;
let currentRoom = null;
let localStream = null;
let screenStream = null;
let peers = {};
let isVideoOn = true;
let isAudioOn = true;
let isSharingScreen = false;
let activePanel = 'videos';
let unreadChat = 0;
let isChatVisible = true;
let roomPermissions = { speak: true, draw: true, screen: true, chat: true };
let userPermissionsOverrides = {};
let isHost = false;
let roomTimerInterval = null;

const iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

// ─── UTILS ───
function toast(msg, type = 'info') {
  const c = document.querySelector('.toast-container') || (() => { const d = document.createElement('div'); d.className = 'toast-container'; document.body.appendChild(d); return d; })();
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return '🖼️';
  if (['mp4','mov','avi','mkv'].includes(ext)) return '🎬';
  if (['mp3','wav','ogg'].includes(ext)) return '🎵';
  if (ext === 'pdf') return '📄';
  if (['doc','docx'].includes(ext)) return '📝';
  if (['xls','xlsx'].includes(ext)) return '📊';
  if (['zip','rar','7z'].includes(ext)) return '🗜️';
  if (['js','ts','py','java','html','css','json'].includes(ext)) return '💻';
  return '📁';
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ─── AUTH ───
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab + '-form').classList.add('active');
  });
});

function showError(elId, msg) {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

document.getElementById('login-btn').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showError('login-error', 'Please fill in all fields'); return; }
  try {
    const data = await api('POST', '/login', { email, password });
    token = data.token; currentUser = data.user;
    localStorage.setItem('cl_token', token);
    localStorage.setItem('cl_user', JSON.stringify(currentUser));
    initDashboard();
  } catch (e) { showError('login-error', e.message); }
});

document.getElementById('reg-btn').addEventListener('click', async () => {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!name || !email || !password) { showError('reg-error', 'Please fill in all fields'); return; }
  try {
    const data = await api('POST', '/register', { name, email, password });
    token = data.token; currentUser = data.user;
    localStorage.setItem('cl_token', token);
    localStorage.setItem('cl_user', JSON.stringify(currentUser));
    initDashboard();
  } catch (e) { showError('reg-error', e.message); }
});

document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-btn').click(); });
document.getElementById('reg-password').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('reg-btn').click(); });

// ─── DASHBOARD ───
function initDashboard() {
  document.getElementById('nav-username').textContent = currentUser.name;
  document.getElementById('nav-avatar').textContent = currentUser.name[0].toUpperCase();
  showScreen('dashboard-screen');
}

document.getElementById('logout-btn').addEventListener('click', () => {
  token = null; currentUser = null;
  localStorage.removeItem('cl_token');
  localStorage.removeItem('cl_user');
  showScreen('auth-screen');
});

document.getElementById('room-private').addEventListener('change', e => {
  document.getElementById('room-password-wrap').classList.toggle('hidden', !e.target.checked);
});

document.getElementById('create-room-btn').addEventListener('click', async () => {
  const name = document.getElementById('room-name').value.trim();
  const isPrivate = document.getElementById('room-private').checked;
  const password = document.getElementById('room-password').value;
  try {
    const data = await api('POST', '/rooms', { name, isPrivate, password });
    joinRoom(data.roomId, password);
  } catch (e) { showDashError(e.message); }
});

document.getElementById('join-room-btn').addEventListener('click', () => {
  const roomId = document.getElementById('join-room-id').value.trim().toUpperCase();
  const password = document.getElementById('join-password').value;
  if (!roomId) { showDashError('Please enter a room code'); return; }
  joinRoom(roomId, password);
});

document.getElementById('join-room-id').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });
document.getElementById('join-room-id').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('join-room-btn').click(); });

function showDashError(msg) {
  const el = document.getElementById('dash-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// ─── JOIN ROOM ───
async function joinRoom(roomId, password) {
  showScreen('room-screen');
  currentRoom = { id: roomId, password };
  document.getElementById('room-code-display').textContent = roomId;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (e) {
    localStream = null;
    toast('Camera/mic unavailable: ' + e.message, 'error');
  }

  addVideoTile('local', currentUser, localStream, true);
  updateParticipantsList([]);

  socket = io({ auth: { token } });

  socket.on('connect', () => { socket.emit('join-room', { roomId, password }); });

  socket.on('room-error', (msg) => {
    toast(msg, 'error');
    cleanup();
    initDashboard();
  });

  socket.on('room-joined', ({ room, permissions, permissionOverrides, participants, whiteboard, chat, files }) => {
    isHost = room.host === currentUser.id;
    roomPermissions = permissions;
    userPermissionsOverrides = permissionOverrides || {};
    document.getElementById('room-title').textContent = room.name;
    document.getElementById('btn-host-controls').style.display = isHost ? '' : 'none';

    if (roomTimerInterval) clearInterval(roomTimerInterval);
    const start = new Date(room.createdAt).getTime();
    const timerEl = document.getElementById('room-timer');
    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      if (timerEl) timerEl.textContent = (h > 0 ? h.toString().padStart(2, '0') + ':' : '') + m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
    };
    updateTimer();
    roomTimerInterval = setInterval(updateTimer, 1000);

    applyPermissions();
    updateParticipantsList(participants);
    wbHistory = whiteboard;
    whiteboard.forEach(d => drawFromData(d));
    chat.forEach(msg => appendChatMessage(msg));
    files.forEach(f => appendFile(f));
    participants.forEach(p => createOffer(p.socketId));
    toast('Joined: ' + room.name, 'success');
  });

  socket.on('user-joined', (participant) => {
    toast(participant.name + ' joined', 'info');
    addParticipant(participant);
  });

  socket.on('user-left', ({ socketId }) => {
    removeParticipant(socketId);
    if (peers[socketId]) { peers[socketId].close(); delete peers[socketId]; }
    removeVideoTile(socketId);
    toast('A participant left', 'info');
  });

  socket.on('offer', async ({ from, offer, user }) => {
    const pc = createPeer(from, user);
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', { to: from, answer });
  });

  socket.on('answer', async ({ from, answer }) => { if (peers[from]) await peers[from].setRemoteDescription(answer); });
  socket.on('ice-candidate', async ({ from, candidate }) => { if (peers[from] && candidate) { try { await peers[from].addIceCandidate(candidate); } catch (e) {} } });

  socket.on('chat-message', (msg) => {
    appendChatMessage(msg);
    if (msg.sender.id !== currentUser.id && !isChatVisible) {
      unreadChat++;
      const b = document.getElementById('chat-badge');
      b.textContent = unreadChat;
      b.classList.remove('hidden');
    }
  });

  socket.on('whiteboard-draw', (data) => { wbHistory.push(data); drawFromData(data); });
  socket.on('whiteboard-clear', () => { wbHistory = []; clearCanvas(); });
  socket.on('file-shared', (fileData) => { appendFile(fileData); toast(fileData.sharedBy.name + ' shared: ' + fileData.originalname, 'info'); });
  socket.on('screen-share-started', ({ user }) => { toast((user ? user.name : 'Someone') + ' started screen sharing', 'info'); });
  socket.on('screen-share-stopped', () => { toast('Screen sharing stopped', 'info'); });
  socket.on('disconnect', () => { toast('Disconnected', 'error'); });
  socket.on('permissions-updated', (perms) => {
    roomPermissions = perms;
    applyPermissions();
    if (!isHost) toast('Room permissions updated by host', 'info');
    if (isHost) renderParticipants();
  });
  socket.on('user-permission-updated', ({ targetSocketId, permission, value }) => {
    if (!userPermissionsOverrides[targetSocketId]) userPermissionsOverrides[targetSocketId] = {};
    userPermissionsOverrides[targetSocketId][permission] = value;
    if (socket && targetSocketId === socket.id) applyPermissions();
    if (isHost) renderParticipants();
  });

  setupRoomControls();
  setupWhiteboard();
  updateVideoGrid();
}

// ─── PARTICIPANTS ───
let participants = {};

function updateParticipantsList(list) {
  participants = {};
  participants['local'] = { id: currentUser.id, name: currentUser.name, avatar: currentUser.name[0].toUpperCase(), socketId: 'local' };
  list.forEach(p => { participants[p.socketId] = p; });
  renderParticipants();
}

function addParticipant(p) { participants[p.socketId] = p; renderParticipants(); }
function removeParticipant(socketId) { delete participants[socketId]; renderParticipants(); }

function renderParticipants() {
  const list = document.getElementById('participants-list');
  const count = Object.keys(participants).length;
  document.getElementById('participant-count').textContent = count;
  list.innerHTML = '';
  Object.values(participants).forEach(p => {
    const isLocal = p.socketId === 'local';
    const div = document.createElement('div');
    div.className = 'participant-item';
    let hostControls = '';
    if (isHost && !isLocal) {
      const canSpeak = userPermissionsOverrides[p.socketId]?.speak !== undefined ? userPermissionsOverrides[p.socketId].speak : roomPermissions.speak;
      hostControls = `<button class="ctrl-btn ${canSpeak ? '' : 'off'}" onclick="window.toggleUserSpeak('${p.socketId}')" style="width:28px;height:28px;margin-left:auto;font-size:0.8rem;border-radius:4px;" title="${canSpeak ? 'Revoke Speak' : 'Allow Speak'}">🎙️</button>`;
    }
    div.innerHTML = '<div class="p-avatar">' + (p.avatar || p.name[0].toUpperCase()) + '</div><div><div class="p-name">' + p.name + '</div>' + (isLocal ? '<div class="p-you">You</div>' : '') + '</div>' + (isLocal ? '<span class="p-host">Host</span>' : '') + hostControls;
    list.appendChild(div);
  });
}

window.toggleUserSpeak = (targetSocketId) => {
  const currentVal = userPermissionsOverrides[targetSocketId]?.speak !== undefined ? userPermissionsOverrides[targetSocketId].speak : roomPermissions.speak;
  if (socket) socket.emit('update-user-permission', { roomId: currentRoom.id, targetSocketId, permission: 'speak', value: !currentVal });
};

// ─── WEBRTC ───
function createPeer(socketId, user) {
  const pc = new RTCPeerConnection(iceConfig);
  peers[socketId] = pc;
  if (localStream) localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  pc.onicecandidate = ({ candidate }) => { if (candidate) socket.emit('ice-candidate', { to: socketId, candidate }); };
  pc.ontrack = ({ streams }) => {
    if (streams[0]) {
      const existing = document.getElementById('video-' + socketId);
      if (existing) {
        let v = existing.querySelector('video');
        if (!v) {
          v = document.createElement('video');
          v.autoplay = true; v.playsInline = true;
          existing.insertBefore(v, existing.querySelector('.tile-label'));
          const av = existing.querySelector('.tile-avatar');
          if (av) av.remove();
        }
        v.srcObject = streams[0];
      }
      else if (user) addVideoTile(socketId, user, streams[0], false);
    }
  };
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') removeVideoTile(socketId); };
  if (user && !document.getElementById('video-' + socketId)) addVideoTile(socketId, user, null, false);
  return pc;
}

async function createOffer(socketId) {
  const pc = createPeer(socketId, participants[socketId]);
  const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
  await pc.setLocalDescription(offer);
  socket.emit('offer', { to: socketId, offer });
}

// ─── VIDEO TILES ───
function addVideoTile(id, user, stream, isLocal) {
  const grid = document.getElementById('videos-grid');
  const tile = document.createElement('div');
  tile.className = 'video-tile';
  tile.id = 'video-' + id;
  if (stream) {
    const video = document.createElement('video');
    video.autoplay = true; video.playsInline = true;
    if (isLocal) video.muted = true;
    video.srcObject = stream;
    tile.appendChild(video);
  } else {
    const av = document.createElement('div');
    av.className = 'tile-avatar';
    av.innerHTML = '<div class="tile-avatar-inner">' + (user.avatar || user.name[0].toUpperCase()) + '</div>';
    tile.appendChild(av);
  }
  const label = document.createElement('div');
  label.className = 'tile-label';
  label.innerHTML = '<span>' + user.name + (isLocal ? ' (You)' : '') + '</span>';
  tile.appendChild(label);
  grid.appendChild(tile);
  updateVideoGrid();
}

function removeVideoTile(id) {
  const tile = document.getElementById('video-' + id);
  if (tile) tile.remove();
  updateVideoGrid();
}

function updateVideoGrid() {
  const grid = document.getElementById('videos-grid');
  const count = grid.children.length;
  grid.className = 'videos-grid';
  if (count <= 1) grid.classList.add('count-1');
  else if (count === 2) grid.classList.add('count-2');
  else if (count === 3) grid.classList.add('count-3');
  else if (count === 4) grid.classList.add('count-4');
  else grid.classList.add('count-many');
}

// ─── ROOM CONTROLS ───
function setupRoomControls() {
  document.getElementById('btn-video').addEventListener('click', () => {
    if (!localStream) return;
    isVideoOn = !isVideoOn;
    localStream.getVideoTracks().forEach(t => t.enabled = isVideoOn);
    const btn = document.getElementById('btn-video');
    btn.classList.toggle('active', isVideoOn);
    btn.classList.toggle('off', !isVideoOn);
    const tile = document.getElementById('video-local');
    if (tile) {
      const v = tile.querySelector('video');
      if (v) v.style.display = isVideoOn ? '' : 'none';
      let av = tile.querySelector('.tile-avatar');
      if (!isVideoOn && !av) { av = document.createElement('div'); av.className = 'tile-avatar'; av.innerHTML = '<div class="tile-avatar-inner">' + currentUser.name[0].toUpperCase() + '</div>'; tile.insertBefore(av, tile.querySelector('.tile-label')); }
      else if (isVideoOn && av) av.remove();
    }
  });

  document.getElementById('btn-audio').addEventListener('click', () => {
    if (!localStream) return;
    isAudioOn = !isAudioOn;
    localStream.getAudioTracks().forEach(t => t.enabled = isAudioOn);
    const btn = document.getElementById('btn-audio');
    btn.classList.toggle('active', isAudioOn);
    btn.classList.toggle('off', !isAudioOn);
  });

  document.getElementById('btn-screen').addEventListener('click', async () => {
    if (isSharingScreen) { stopScreenShare(); return; }
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      isSharingScreen = true;
      document.getElementById('btn-screen').classList.add('active');
      const screenTrack = screenStream.getVideoTracks()[0];
      Object.values(peers).forEach(pc => { const s = pc.getSenders().find(s => s.track && s.track.kind === 'video'); if (s) s.replaceTrack(screenTrack); });
      const tile = document.getElementById('video-local');
      if (tile) { let v = tile.querySelector('video'); if (!v) { v = document.createElement('video'); v.autoplay = true; v.playsInline = true; v.muted = true; tile.insertBefore(v, tile.querySelector('.tile-label')); } v.srcObject = screenStream; v.style.display = ''; const av = tile.querySelector('.tile-avatar'); if (av) av.remove(); }
      socket.emit('screen-share-started', { roomId: currentRoom.id });
      toast('Screen sharing started', 'success');
      screenTrack.addEventListener('ended', stopScreenShare);
    } catch (e) { toast('Could not share screen: ' + e.message, 'error'); }
  });

  document.querySelectorAll('.tab-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-trigger').forEach(b => b.classList.remove('active-tab'));
      btn.classList.add('active-tab');
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      const panel = btn.dataset.panel;
      const target = panel === 'chat' ? 'panel-chat-mobile' : 'panel-' + panel;
      document.getElementById(target).classList.add('active');
      activePanel = panel;
      if (panel === 'chat') { isChatVisible = true; unreadChat = 0; document.getElementById('chat-badge').classList.add('hidden'); }
      if (panel === 'whiteboard') { setTimeout(resizeCanvas, 50); }
    });
  });

  document.querySelectorAll('.stab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.stab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('stab-' + btn.dataset.stab).classList.add('active');
      if (btn.dataset.stab === 'chat') { isChatVisible = true; unreadChat = 0; document.getElementById('chat-badge').classList.add('hidden'); }
    });
  });

  document.getElementById('btn-leave').addEventListener('click', () => { cleanup(); initDashboard(); });

  function sendChat(inputId) {
    const input = document.getElementById(inputId);
    const msg = input.value.trim();
    if (!msg || !socket) return;
    socket.emit('chat-message', { roomId: currentRoom.id, message: msg });
    input.value = '';
  }
  document.getElementById('chat-send').addEventListener('click', () => sendChat('chat-input'));
  document.getElementById('chat-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat('chat-input'); });
  document.getElementById('chat-send-mobile').addEventListener('click', () => sendChat('chat-input-mobile'));
  document.getElementById('chat-input-mobile').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat('chat-input-mobile'); });

  document.getElementById('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    const formData = new FormData();
    formData.append('file', file);
    const prog = document.createElement('div');
    prog.className = 'upload-progress';
    prog.innerHTML = '<div style="font-size:.8rem;color:var(--text2)">Uploading ' + file.name + '…</div><div class="progress-bar-wrap"><div class="progress-bar" style="width:0%"></div></div>';
    document.getElementById('files-list').querySelector('.empty-state') && document.getElementById('files-list').querySelector('.empty-state').remove();
    document.getElementById('files-list').appendChild(prog);
    const bar = prog.querySelector('.progress-bar');
    let pct = 0;
    const interval = setInterval(() => { pct = Math.min(pct + 10, 85); bar.style.width = pct + '%'; }, 200);
    try {
      const res = await fetch('/api/upload', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: formData });
      const data = await res.json();
      clearInterval(interval); bar.style.width = '100%'; prog.remove();
      if (!res.ok) { toast('Upload failed: ' + data.error, 'error'); return; }
      socket.emit('file-shared', { roomId: currentRoom.id, file: { filename: data.filename, originalname: data.originalname, size: data.size, url: data.url } });
      toast('Uploaded: ' + data.originalname, 'success');
    } catch (err) { clearInterval(interval); prog.remove(); toast('Upload failed', 'error'); }
  });

  document.getElementById('room-code-display').addEventListener('click', () => {
    navigator.clipboard.writeText(currentRoom.id).then(() => toast('Room code copied!', 'success')).catch(() => toast('Copy: ' + currentRoom.id, 'info'));
  });

  document.getElementById('btn-host-controls').addEventListener('click', () => {
    document.getElementById('perm-speak').checked = roomPermissions.speak;
    document.getElementById('perm-draw').checked = roomPermissions.draw;
    document.getElementById('perm-screen').checked = roomPermissions.screen;
    document.getElementById('perm-chat').checked = roomPermissions.chat;
    document.getElementById('host-modal').classList.remove('hidden');
  });

  document.getElementById('host-modal-close').addEventListener('click', () => {
    document.getElementById('host-modal').classList.add('hidden');
    const newPerms = {
      speak: document.getElementById('perm-speak').checked,
      draw: document.getElementById('perm-draw').checked,
      screen: document.getElementById('perm-screen').checked,
      chat: document.getElementById('perm-chat').checked
    };
    if (socket && isHost) socket.emit('update-permissions', { roomId: currentRoom.id, permissions: newPerms });
  });
}

function applyPermissions() {
  if (!isHost) {
    const canSpeak = socket && userPermissionsOverrides[socket.id]?.speak !== undefined ? userPermissionsOverrides[socket.id].speak : roomPermissions.speak;
    const btnAudio = document.getElementById('btn-audio');
    btnAudio.disabled = !canSpeak;
    btnAudio.style.opacity = canSpeak ? '1' : '0.5';
    btnAudio.style.pointerEvents = canSpeak ? 'auto' : 'none';
    if (!canSpeak && isAudioOn) {
      btnAudio.click(); // force mute
    }

    document.getElementById('btn-screen').disabled = !roomPermissions.screen;
    document.getElementById('chat-input').disabled = !roomPermissions.chat;
    document.getElementById('chat-input-mobile').disabled = !roomPermissions.chat;
    document.getElementById('chat-input').placeholder = roomPermissions.chat ? 'Type a message…' : 'Chat is disabled';
    document.getElementById('chat-input-mobile').placeholder = roomPermissions.chat ? 'Type a message…' : 'Chat is disabled';
    document.querySelectorAll('.wb-tool, #wb-clear').forEach(btn => btn.disabled = !roomPermissions.draw);
    document.getElementById('whiteboard-canvas').style.pointerEvents = roomPermissions.draw ? 'auto' : 'none';
  } else {
    document.getElementById('btn-screen').disabled = false;
    document.getElementById('chat-input').disabled = false;
    document.getElementById('chat-input-mobile').disabled = false;
    document.getElementById('chat-input').placeholder = 'Type a message…';
    document.getElementById('chat-input-mobile').placeholder = 'Type a message…';
    document.querySelectorAll('.wb-tool, #wb-clear').forEach(btn => btn.disabled = false);
    document.getElementById('whiteboard-canvas').style.pointerEvents = 'auto';
  }
}

function stopScreenShare() {
  isSharingScreen = false;
  document.getElementById('btn-screen').classList.remove('active');
  if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
  if (localStream) {
    const camTrack = localStream.getVideoTracks()[0];
    if (camTrack) {
      Object.values(peers).forEach(pc => { const s = pc.getSenders().find(s => s.track && s.track.kind === 'video'); if (s) s.replaceTrack(camTrack); });
      const tile = document.getElementById('video-local');
      if (tile) { let v = tile.querySelector('video'); if (!v) { v = document.createElement('video'); v.autoplay = true; v.playsInline = true; v.muted = true; tile.insertBefore(v, tile.querySelector('.tile-label')); } v.srcObject = localStream; }
    }
  }
  if (socket) socket.emit('screen-share-stopped', { roomId: currentRoom.id });
  toast('Screen sharing stopped', 'info');
}

// ─── CHAT ───
function appendChatMessage(msg) {
  const isOwn = msg.sender.id === currentUser.id;
  const html = '<div class="chat-msg ' + (isOwn ? 'own' : '') + '">' + (!isOwn ? '<div class="chat-meta">' + msg.sender.name + '</div>' : '') + '<div class="chat-bubble">' + escapeHtml(msg.text) + '</div><div class="chat-meta">' + formatTime(msg.timestamp) + '</div></div>';
  ['chat-messages', 'chat-messages-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.insertAdjacentHTML('beforeend', html); el.scrollTop = el.scrollHeight; }
  });
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── FILES ───
function appendFile(fileData) {
  const list = document.getElementById('files-list');
  const em = list.querySelector('.empty-state');
  if (em) em.remove();
  const item = document.createElement('div');
  item.className = 'file-item';
  item.innerHTML = '<div class="file-icon">' + fileIcon(fileData.originalname) + '</div><div class="file-meta"><div class="file-name">' + escapeHtml(fileData.originalname) + '</div><div class="file-info">' + formatSize(fileData.size) + ' · ' + (fileData.sharedBy ? fileData.sharedBy.name : 'Unknown') + '</div></div><a href="' + fileData.url + '" download="' + escapeHtml(fileData.originalname) + '" target="_blank" class="file-dl" title="Download"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg></a>';
  list.appendChild(item);
}

// ─── WHITEBOARD ───
let wbCanvas, wbCtx, wbDrawing = false, wbTool = 'pen', wbStartX, wbStartY;
let wbColor = '#6366f1', wbSize = 4, wbSnapshot = null;
let wbHistory = [];

function setupWhiteboard() {
  wbCanvas = document.getElementById('whiteboard-canvas');
  wbCtx = wbCanvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  document.getElementById('wb-color').addEventListener('input', e => wbColor = e.target.value);
  document.getElementById('wb-size').addEventListener('input', e => wbSize = parseInt(e.target.value));

  document.querySelectorAll('.wb-tool').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.wb-tool').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      wbTool = btn.id.replace('wb-', '');
      wbCanvas.style.cursor = wbTool === 'eraser' ? 'cell' : wbTool === 'text' ? 'text' : 'crosshair';
    });
  });

  document.getElementById('wb-clear').addEventListener('click', () => {
    wbHistory = [];
    clearCanvas();
    if (socket) socket.emit('whiteboard-clear', { roomId: currentRoom.id });
  });

  wbCanvas.addEventListener('mousedown', startDraw);
  wbCanvas.addEventListener('mousemove', continueDraw);
  wbCanvas.addEventListener('mouseup', endDraw);
  wbCanvas.addEventListener('mouseleave', endDraw);
  wbCanvas.addEventListener('touchstart', e => { e.preventDefault(); startDraw(e.touches[0]); }, { passive: false });
  wbCanvas.addEventListener('touchmove', e => { e.preventDefault(); continueDraw(e.touches[0]); }, { passive: false });
  wbCanvas.addEventListener('touchend', e => { e.preventDefault(); endDraw(); }, { passive: false });

  const textInput = document.getElementById('wb-text-input');
  let textInputPos = null;

  wbCanvas.addEventListener('click', e => {
    if (wbTool !== 'text') return;
    const rect = wbCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    textInputPos = { x, y };
    textInput.style.left = x + 'px';
    textInput.style.top = (y - 12) + 'px';
    textInput.style.display = 'block';
    textInput.style.fontSize = (wbSize * 4 + 12) + 'px';
    textInput.style.color = wbColor;
    textInput.value = '';
    textInput.focus();
  });

  const commitText = () => {
    if (textInput.style.display === 'none') return;
    const text = textInput.value.trim();
    if (text && textInputPos) {
      wbCtx.fillStyle = wbColor;
      wbCtx.font = (wbSize * 4 + 12) + 'px Inter, sans-serif';
      wbCtx.fillText(text, textInputPos.x, textInputPos.y);
      if (socket) {
        const data = { type: 'text', x: textInputPos.x, y: textInputPos.y, text, color: wbColor, size: wbSize };
        wbHistory.push(data);
        socket.emit('whiteboard-draw', { roomId: currentRoom.id, data });
      }
    }
    textInput.style.display = 'none';
  };
  textInput.addEventListener('blur', commitText);
  textInput.addEventListener('keydown', e => { if (e.key === 'Enter') commitText(); });
}

function resizeCanvas() {
  if (wbCanvas.offsetWidth === 0 || wbCanvas.offsetHeight === 0) return;
  wbCanvas.width = wbCanvas.offsetWidth;
  wbCanvas.height = wbCanvas.offsetHeight;
  clearCanvas();
  wbHistory.forEach(d => drawFromData(d));
}

function getPos(e) {
  const rect = wbCanvas.getBoundingClientRect();
  return { x: (e.clientX || e.pageX) - rect.left, y: (e.clientY || e.pageY) - rect.top };
}

function startDraw(e) {
  if (wbTool === 'text') return;
  wbDrawing = true;
  const p = getPos(e);
  wbStartX = p.x; wbStartY = p.y;
  wbSnapshot = wbCtx.getImageData(0, 0, wbCanvas.width, wbCanvas.height);
  if (wbTool === 'pen' || wbTool === 'eraser') { wbCtx.beginPath(); wbCtx.moveTo(p.x, p.y); }
}

function continueDraw(e) {
  if (!wbDrawing) return;
  const p = getPos(e);
  if (wbTool === 'pen') {
    wbCtx.strokeStyle = wbColor; wbCtx.lineWidth = wbSize; wbCtx.lineCap = 'round'; wbCtx.lineJoin = 'round';
    wbCtx.lineTo(p.x, p.y); wbCtx.stroke();
    if (socket) {
      const data = { type: 'line-segment', x1: wbStartX, y1: wbStartY, x2: p.x, y2: p.y, color: wbColor, size: wbSize };
      wbHistory.push(data);
      socket.emit('whiteboard-draw', { roomId: currentRoom.id, data });
    }
    wbStartX = p.x; wbStartY = p.y;
  } else if (wbTool === 'eraser') {
    wbCtx.clearRect(p.x - wbSize * 3, p.y - wbSize * 3, wbSize * 6, wbSize * 6);
    if (socket) {
      const data = { type: 'eraser', x: p.x, y: p.y, size: wbSize };
      wbHistory.push(data);
      socket.emit('whiteboard-draw', { roomId: currentRoom.id, data });
    }
  } else {
    wbCtx.putImageData(wbSnapshot, 0, 0);
    wbCtx.strokeStyle = wbColor; wbCtx.lineWidth = wbSize; wbCtx.beginPath();
    if (wbTool === 'line') { wbCtx.moveTo(wbStartX, wbStartY); wbCtx.lineTo(p.x, p.y); wbCtx.stroke(); }
    else if (wbTool === 'rect') { wbCtx.strokeRect(wbStartX, wbStartY, p.x - wbStartX, p.y - wbStartY); }
    else if (wbTool === 'circle') { const r = Math.sqrt(Math.pow(p.x - wbStartX, 2) + Math.pow(p.y - wbStartY, 2)); wbCtx.arc(wbStartX, wbStartY, r, 0, Math.PI * 2); wbCtx.stroke(); }
  }
}

function endDraw(e) {
  if (!wbDrawing) return;
  wbDrawing = false;
  if (['line', 'rect', 'circle'].includes(wbTool) && e && e.type !== 'touchend') {
    const p = e.type === 'mouseleave' ? { x: wbStartX, y: wbStartY } : getPos(e);
    if (socket) {
      const data = { type: wbTool, x1: wbStartX, y1: wbStartY, x2: p.x, y2: p.y, color: wbColor, size: wbSize };
      wbHistory.push(data);
      socket.emit('whiteboard-draw', { roomId: currentRoom.id, data });
    }
  }
}

function drawFromData(data) {
  if (!wbCtx) return;
  wbCtx.strokeStyle = data.color || '#6366f1'; wbCtx.lineWidth = data.size || 4; wbCtx.lineCap = 'round'; wbCtx.lineJoin = 'round';
  if (data.type === 'line-segment') { wbCtx.beginPath(); wbCtx.moveTo(data.x1, data.y1); wbCtx.lineTo(data.x2, data.y2); wbCtx.stroke(); }
  else if (data.type === 'eraser') { wbCtx.clearRect(data.x - data.size * 3, data.y - data.size * 3, data.size * 6, data.size * 6); }
  else if (data.type === 'line') { wbCtx.beginPath(); wbCtx.moveTo(data.x1, data.y1); wbCtx.lineTo(data.x2, data.y2); wbCtx.stroke(); }
  else if (data.type === 'rect') { wbCtx.beginPath(); wbCtx.strokeRect(data.x1, data.y1, data.x2 - data.x1, data.y2 - data.y1); }
  else if (data.type === 'circle') { const r = Math.sqrt(Math.pow(data.x2 - data.x1, 2) + Math.pow(data.y2 - data.y1, 2)); wbCtx.beginPath(); wbCtx.arc(data.x1, data.y1, r, 0, Math.PI * 2); wbCtx.stroke(); }
  else if (data.type === 'text') { wbCtx.fillStyle = data.color; wbCtx.font = (data.size * 4 + 12) + 'px Inter, sans-serif'; wbCtx.fillText(data.text, data.x, data.y); }
}

function clearCanvas() { if (wbCtx && wbCanvas) wbCtx.clearRect(0, 0, wbCanvas.width, wbCanvas.height); }

// ─── CLEANUP ───
function cleanup() {
  if (roomTimerInterval) { clearInterval(roomTimerInterval); roomTimerInterval = null; }
  const timerEl = document.getElementById('room-timer');
  if (timerEl) timerEl.textContent = '00:00';

  if (socket) { socket.disconnect(); socket = null; }
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
  Object.values(peers).forEach(pc => pc.close());
  peers = {}; participants = {}; currentRoom = null;
  isSharingScreen = false; isVideoOn = true; isAudioOn = true; unreadChat = 0;
  document.getElementById('videos-grid').innerHTML = '';
  document.getElementById('chat-messages').innerHTML = '';
  document.getElementById('chat-messages-mobile').innerHTML = '';
  document.getElementById('files-list').innerHTML = '<div class="empty-state"><div class="empty-icon">📁</div><p>No files shared yet</p></div>';
  document.getElementById('participants-list').innerHTML = '';
  if (wbCtx && wbCanvas) wbCtx.clearRect(0, 0, wbCanvas.width, wbCanvas.height);
}

// ─── INIT ───
if (token && currentUser) { initDashboard(); } else { showScreen('auth-screen'); }
