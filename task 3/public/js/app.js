const API_URL = '/api';
let socket;
let currentUser = null;
let currentBoard = null;
let users = [];
let boardMembers = [];
let unreadNotificationsCount = 0;
let saveTimeout = null;

// DOM Elements
const authView = document.getElementById('auth-view');
const boardView = document.getElementById('board-view');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const taskModal = document.getElementById('task-modal');
const toastEl = document.getElementById('toast');
const chatPanel = document.getElementById('chat-panel');
const boardSettingsModal = document.getElementById('board-settings-modal');
const createBoardModal = document.getElementById('create-board-modal');
const profileModal = document.getElementById('profile-modal');
const boardFilesModal = document.getElementById('board-files-modal');
const mentionDropdown = document.getElementById('mention-dropdown');
const notifDropdown = document.getElementById('notif-dropdown');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (token) {
        const username = localStorage.getItem('username');
        const id = localStorage.getItem('userId');
        const avatarUrl = localStorage.getItem('avatarUrl');
        if (username && id) {
            currentUser = { token, username, id, avatarUrl: avatarUrl === 'undefined' ? null : avatarUrl };
            showBoardView();
        }
    }
    
    // Auto-save listeners
    document.getElementById('task-title').addEventListener('input', scheduleAutoSave);
    document.getElementById('task-desc').addEventListener('input', scheduleAutoSave);
    document.getElementById('task-status').addEventListener('change', scheduleAutoSave);
    document.getElementById('task-assignee').addEventListener('change', scheduleAutoSave);
    
    // Mention listener
    document.getElementById('new-comment').addEventListener('input', handleMentionInput);
});

// --- Auth ---
function toggleAuthMode() {
    if (loginForm.style.display === 'none') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    }
}

async function login() {
    const usernameInput = document.getElementById('login-username').value;
    const passwordInput = document.getElementById('login-password').value;
    
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        
        const data = await res.json();
        if (res.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('username', data.username);
            localStorage.setItem('userId', data.id);
            localStorage.setItem('avatarUrl', data.avatarUrl);
            currentUser = data;
            showBoardView();
            showToast('Logged in successfully');
        } else {
            showToast(data.error || 'Login failed');
        }
    } catch (err) {
        showToast('Connection error');
    }
}

async function register() {
    const usernameInput = document.getElementById('reg-username').value;
    const passwordInput = document.getElementById('reg-password').value;
    
    try {
        const res = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: usernameInput, password: passwordInput })
        });
        
        const data = await res.json();
        if (res.ok) {
            showToast('Registration successful, please login');
            toggleAuthMode();
        } else {
            showToast(data.error || 'Registration failed');
        }
    } catch (err) {
        showToast('Connection error');
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('userId');
    localStorage.removeItem('avatarUrl');
    currentUser = null;
    if (socket) socket.disconnect();
    
    boardView.style.display = 'none';
    authView.style.display = 'flex';
}

// --- Board View & API ---
async function showBoardView() {
    authView.style.display = 'none';
    boardView.style.display = 'block';
    
    renderNavbarAvatar();
    
    initSocket();
    await fetchUsers();
    await fetchBoards();
    fetchNotifications();
}

async function fetchWithAuth(url, options = {}) {
    if (!options.headers) options.headers = {};
    if (!(options.body instanceof FormData)) {
        options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
    } else {
        delete options.headers['Content-Type']; // Let browser set boundary for multipart/form-data
    }
    options.headers['Authorization'] = `Bearer ${currentUser.token}`;
    
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
        if(res.status === 401) {
            logout();
            throw new Error('Unauthorized');
        }
    }
    return res;
}

async function fetchUsers() {
    try {
        const res = await fetchWithAuth(`${API_URL}/users`);
        users = await res.json();
    } catch (err) { console.error(err); }
}

async function fetchBoards() {
    try {
        const [activeRes, archivedRes] = await Promise.all([
            fetchWithAuth(`${API_URL}/boards`),
            fetchWithAuth(`${API_URL}/boards/archived`)
        ]);
        
        const activeBoards = await activeRes.json();
        const archivedBoards = await archivedRes.json();
        
        renderSidebarBoards(activeBoards, archivedBoards);
        
        if (activeBoards.length > 0 && !currentBoard) {
            switchBoard(activeBoards[0]);
        } else if (currentBoard) {
            const updatedBoard = activeBoards.find(b => b._id === currentBoard._id) || archivedBoards.find(b => b._id === currentBoard._id);
            if (updatedBoard) switchBoard(updatedBoard);
            else { currentBoard = null; document.querySelector('.board-container').style.display = 'none'; }
        } else {
            document.querySelector('.board-container').style.display = 'none';
        }
    } catch (err) { console.error(err); }
}

function renderSidebarBoards(activeBoards, archivedBoards) {
    const activeList = document.getElementById('board-list');
    const archList = document.getElementById('archived-board-list');
    
    activeList.innerHTML = '';
    archList.innerHTML = '';
    
    activeBoards.forEach(b => {
        const li = document.createElement('li');
        li.textContent = b.name;
        if (currentBoard && b._id === currentBoard._id) li.classList.add('active');
        li.onclick = () => switchBoard(b);
        activeList.appendChild(li);
    });
    
    archivedBoards.forEach(b => {
        const li = document.createElement('li');
        li.textContent = b.name;
        li.classList.add('archived');
        li.onclick = () => { showToast('Please unarchive the board to view it.'); };
        archList.appendChild(li);
    });
}

function switchBoard(board) {
    currentBoard = board;
    document.querySelector('.board-container').style.display = 'block';
    document.getElementById('board-name').textContent = board.name;
    
    const role = (board.roles && board.roles[currentUser.id]) || 'member';
    const badge = document.getElementById('board-role-badge');
    badge.textContent = role.charAt(0).toUpperCase() + role.slice(1);
    badge.className = `role-badge role-${role}`;
    
    // UI permissions
    if (role === 'owner' || role === 'admin') {
        document.getElementById('btn-board-settings').style.display = 'inline-block';
    } else {
        document.getElementById('btn-board-settings').style.display = 'none';
    }
    
    socket.emit('join-board', board._id);
    fetchTasks();
    populateTaskAssigneeDropdown();
    
    // Refresh sidebar highlights
    document.querySelectorAll('#board-list li').forEach(li => li.classList.remove('active'));
    Array.from(document.querySelectorAll('#board-list li')).find(li => li.textContent === board.name)?.classList.add('active');
}

// --- Board Modals (Create, Settings, Files) ---
function openCreateBoardModal() {
    document.getElementById('new-board-name').value = '';
    createBoardModal.style.display = 'flex';
}
function closeCreateBoardModal() { createBoardModal.style.display = 'none'; }

async function submitCreateBoard() {
    const name = document.getElementById('new-board-name').value;
    if (!name) return showToast('Board name required');
    try {
        await fetchWithAuth(`${API_URL}/boards`, {
            method: 'POST',
            body: JSON.stringify({ name })
        });
        closeCreateBoardModal();
        fetchBoards();
    } catch (e) { showToast('Error creating board'); }
}

function openBoardSettingsModal() {
    if (!currentBoard) return;
    boardSettingsModal.style.display = 'flex';
    renderBoardMembers();
}
function closeBoardSettingsModal() { boardSettingsModal.style.display = 'none'; }

function renderBoardMembers() {
    const list = document.getElementById('board-members-list');
    list.innerHTML = '';
    const myRole = currentBoard.roles[currentUser.id];
    const isOwner = myRole === 'owner';
    
    currentBoard.members.forEach(memberId => {
        const u = users.find(user => user._id === memberId);
        if (!u) return;
        const role = currentBoard.roles[memberId];
        
        const div = document.createElement('div');
        div.className = 'member-item';
        
        let roleSelectHTML = `<span class="role-badge role-${role}">${role}</span>`;
        if (isOwner && memberId !== currentBoard.ownerId) {
            roleSelectHTML = `
                <select onchange="changeUserRole('${memberId}', this.value)">
                    <option value="admin" ${role==='admin'?'selected':''}>Admin</option>
                    <option value="member" ${role==='member'?'selected':''}>Member</option>
                </select>
                <button class="btn-icon delete" onclick="removeBoardMember('${memberId}')">🗑️</button>
            `;
        }
        
        div.innerHTML = `
            <div class="member-info">
                ${u.avatarUrl ? `<img src="${u.avatarUrl}" class="avatar-small">` : `<div class="avatar-initials-small">${u.username[0].toUpperCase()}</div>`}
                <span>${u.username}</span>
            </div>
            <div style="display:flex; gap:0.5rem; align-items:center;">
                ${roleSelectHTML}
            </div>
        `;
        list.appendChild(div);
    });
}

async function changeUserRole(userId, newRole) {
    try {
        const res = await fetchWithAuth(`${API_URL}/boards/${currentBoard._id}/roles`, {
            method: 'PUT',
            body: JSON.stringify({ targetUserId: userId, newRole })
        });
        if(!res.ok) showToast('Failed to update role');
    } catch(e) {}
}

async function addBoardMember() {
    const username = document.getElementById('new-member-username').value;
    if (!username) return;
    try {
        const res = await fetchWithAuth(`${API_URL}/boards/${currentBoard._id}/members`, {
            method: 'POST',
            body: JSON.stringify({ username, role: 'member' })
        });
        if (res.ok) {
            document.getElementById('new-member-username').value = '';
            showToast('Member added');
        } else {
            const data = await res.json();
            showToast(data.error);
        }
    } catch (e) { showToast('Error adding member'); }
}

async function removeBoardMember(userId) {
    if(!confirm('Remove this member?')) return;
    try {
        await fetchWithAuth(`${API_URL}/boards/${currentBoard._id}/members/${userId}`, { method: 'DELETE' });
    } catch (e) {}
}

async function archiveCurrentBoard() {
    if(!confirm('Archive this board? It will be hidden from everyone.')) return;
    try {
        await fetchWithAuth(`${API_URL}/boards/${currentBoard._id}/archive`, { method: 'POST' });
        closeBoardSettingsModal();
        currentBoard = null;
        fetchBoards();
    } catch (e) { showToast('Error archiving board'); }
}


// --- Board Files ---
function openBoardFilesModal() {
    if(!currentBoard) return;
    boardFilesModal.style.display = 'flex';
    fetchBoardFiles();
}
function closeBoardFilesModal() { boardFilesModal.style.display = 'none'; }

async function fetchBoardFiles() {
    try {
        const res = await fetchWithAuth(`${API_URL}/boards/${currentBoard._id}/files`);
        const files = await res.json();
        renderFileList(files, 'board-file-list');
    } catch (e) {}
}

async function uploadBoardFile() {
    const input = document.getElementById('board-file-input');
    if (!input.files[0]) return showToast('Please select a file');
    
    const formData = new FormData();
    formData.append('file', input.files[0]);
    
    try {
        await fetchWithAuth(`${API_URL}/boards/${currentBoard._id}/files`, {
            method: 'POST',
            body: formData
        });
        input.value = ''; // clear
    } catch(e) { showToast('Upload failed'); }
}


// --- Tasks ---
const tasksData = {};

async function fetchTasks() {
    if (!currentBoard) return;
    try {
        const res = await fetchWithAuth(`${API_URL}/boards/${currentBoard._id}/tasks`);
        const tasks = await res.json();
        renderTasks(tasks);
    } catch (err) { console.error('Failed to fetch tasks', err); }
}

function renderTasks(tasks) {
    const listTodo = document.getElementById('list-todo');
    const listInProgress = document.getElementById('list-inprogress');
    const listDone = document.getElementById('list-done');
    
    listTodo.innerHTML = '';
    listInProgress.innerHTML = '';
    listDone.innerHTML = '';
    
    let countTodo = 0, countInProgress = 0, countDone = 0;
    
    tasks.forEach(task => {
        tasksData[task._id] = task;
        const card = createTaskCard(task);
        
        if (task.status === 'To Do') { listTodo.appendChild(card); countTodo++; }
        else if (task.status === 'In Progress') { listInProgress.appendChild(card); countInProgress++; }
        else if (task.status === 'Done') { listDone.appendChild(card); countDone++; }
    });
    
    document.getElementById('count-todo').textContent = countTodo;
    document.getElementById('count-inprogress').textContent = countInProgress;
    document.getElementById('count-done').textContent = countDone;
}

function createTaskCard(task) {
    const div = document.createElement('div');
    div.className = 'task-card';
    div.draggable = true;
    div.id = `task-${task._id}`;
    div.ondragstart = (e) => drag(e, task._id);
    
    const assigneeName = task.assigneeId ? (users.find(u => u._id === task.assigneeId)?.username || 'Unknown') : '';
    
    div.innerHTML = `
        <div class="task-actions">
            <button class="btn-icon edit" onclick="editTask('${task._id}')">✏️</button>
            <button class="btn-icon delete" onclick="deleteTask('${task._id}')">🗑️</button>
        </div>
        <h4>${escapeHTML(task.title)}</h4>
        ${task.description ? `<p>${escapeHTML(task.description)}</p>` : ''}
        <div class="task-meta">
            <span>📅 ${new Date(task.createdAt).toLocaleDateString()}</span>
            ${assigneeName ? `<span class="task-assignee">👤 ${assigneeName}</span>` : ''}
        </div>
    `;
    
    div.onclick = (e) => {
        if (!e.target.closest('.btn-icon')) { editTask(task._id); }
    };
    
    return div;
}

function populateTaskAssigneeDropdown() {
    const select = document.getElementById('task-assignee');
    select.innerHTML = '<option value="">Unassigned</option>';
    if(!currentBoard) return;
    currentBoard.members.forEach(memberId => {
        const u = users.find(user => user._id === memberId);
        if(u) {
            const option = document.createElement('option');
            option.value = u._id;
            option.textContent = u.username;
            select.appendChild(option);
        }
    });
}

// Drag & Drop
function drag(ev, taskId) { ev.dataTransfer.setData("text/plain", taskId); }
function allowDrop(ev) { ev.preventDefault(); }
async function drop(ev, newStatus) {
    ev.preventDefault();
    const taskId = ev.dataTransfer.getData("text/plain");
    const task = tasksData[taskId];
    
    if (task && task.status !== newStatus) {
        task.status = newStatus;
        renderTasks(Object.values(tasksData));
        try {
            await fetchWithAuth(`${API_URL}/tasks/${taskId}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: newStatus, boardId: currentBoard._id })
            });
        } catch (err) {}
    }
}

// Task Modal
function openTaskModal() {
    document.getElementById('modal-title').textContent = 'Create Task';
    document.getElementById('task-id').value = '';
    document.getElementById('task-title').value = '';
    document.getElementById('task-desc').value = '';
    document.getElementById('task-status').value = 'To Do';
    document.getElementById('task-assignee').value = '';
    document.getElementById('comments-section').style.display = 'none';
    document.getElementById('task-files-section').style.display = 'none';
    document.getElementById('task-save-status').className = 'save-status';
    
    taskModal.style.display = 'flex';
}

function closeTaskModal() { taskModal.style.display = 'none'; clearTimeout(saveTimeout); }

// Auto-save Logic
function scheduleAutoSave() {
    const taskId = document.getElementById('task-id').value;
    if (!taskId) return; // Only auto-save existing tasks
    
    const statusEl = document.getElementById('task-save-status');
    statusEl.textContent = 'Saving...';
    statusEl.className = 'save-status show';
    
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveTask, 1500); // 1.5s debounce
}

async function saveTask() {
    const id = document.getElementById('task-id').value;
    const title = document.getElementById('task-title').value;
    const description = document.getElementById('task-desc').value;
    const status = document.getElementById('task-status').value;
    const assigneeId = document.getElementById('task-assignee').value;
    
    if (!currentBoard) return showToast('No project available.');
    if (!title) return showToast('Title is required');
    
    const payload = { title, description, status, assigneeId: assigneeId || null, boardId: currentBoard._id };
    
    try {
        let res;
        if (id) {
            res = await fetchWithAuth(`${API_URL}/tasks/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });
        } else {
            res = await fetchWithAuth(`${API_URL}/tasks`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        }
        
        if (res.ok) {
            const data = await res.json();
            if(!id) {
                closeTaskModal(); // Close if it was a create action
            } else {
                const statusEl = document.getElementById('task-save-status');
                statusEl.textContent = 'Saved ✓';
                setTimeout(() => statusEl.className = 'save-status', 2000);
            }
        }
    } catch (err) { showToast('Error saving task'); }
}

async function editTask(id) {
    const task = tasksData[id];
    if (!task) return;
    
    document.getElementById('modal-title').textContent = 'Edit Task';
    document.getElementById('task-id').value = task._id;
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-desc').value = task.description;
    document.getElementById('task-status').value = task.status;
    document.getElementById('task-assignee').value = task.assigneeId || '';
    
    document.getElementById('comments-section').style.display = 'block';
    document.getElementById('task-files-section').style.display = 'block';
    document.getElementById('task-save-status').className = 'save-status';
    
    taskModal.style.display = 'flex';
    fetchComments(id);
    fetchTaskFiles(id);
}

async function deleteTask(id) {
    if (confirm('Are you sure you want to delete this task?')) {
        try {
            await fetchWithAuth(`${API_URL}/tasks/${id}?boardId=${currentBoard._id}`, { method: 'DELETE' });
        } catch (err) { showToast('Error deleting task'); }
    }
}

// --- Task Files ---
async function fetchTaskFiles(taskId) {
    try {
        const res = await fetchWithAuth(`${API_URL}/tasks/${taskId}/files`);
        const files = await res.json();
        renderFileList(files, 'task-file-list');
    } catch (e) {}
}

async function uploadTaskFile() {
    const taskId = document.getElementById('task-id').value;
    const input = document.getElementById('task-file-input');
    if (!input.files[0] || !taskId) return showToast('Please select a file');
    
    const formData = new FormData();
    formData.append('file', input.files[0]);
    
    try {
        await fetchWithAuth(`${API_URL}/tasks/${taskId}/files`, { method: 'POST', body: formData });
        input.value = ''; // clear
        fetchTaskFiles(taskId);
    } catch(e) { showToast('Upload failed'); }
}

function renderFileList(files, containerId) {
    const list = document.getElementById(containerId);
    list.innerHTML = '';
    files.forEach(f => {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.innerHTML = `
            <span>📄 ${escapeHTML(f.filename)}</span>
            <a href="${f.url}" target="_blank" download class="btn-link">Download</a>
        `;
        list.appendChild(div);
    });
}

// --- Comments & Mentions ---
async function fetchComments(taskId) {
    try {
        const res = await fetchWithAuth(`${API_URL}/tasks/${taskId}/comments`);
        const comments = await res.json();
        renderComments(comments);
    } catch (err) {}
}

function highlightMentions(text) {
    return text.replace(/@(\w+)/g, '<span class="mention-highlight">@$1</span>');
}

function renderComments(comments) {
    const list = document.getElementById('comments-list');
    list.innerHTML = '';
    comments.forEach(c => {
        const div = document.createElement('div');
        div.className = 'comment';
        div.innerHTML = `
            <div class="comment-author">${escapeHTML(c.username)} - ${new Date(c.createdAt).toLocaleString()}</div>
            <div class="comment-text">${highlightMentions(escapeHTML(c.text))}</div>
        `;
        list.appendChild(div);
    });
}

async function addComment() {
    const taskId = document.getElementById('task-id').value;
    const textInput = document.getElementById('new-comment');
    const text = textInput.value.trim();
    
    if (!text || !taskId) return;
    
    try {
        const res = await fetchWithAuth(`${API_URL}/tasks/${taskId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ text, boardId: currentBoard._id })
        });
        if (res.ok) { textInput.value = ''; }
    } catch (err) { showToast('Error adding comment'); }
}

function handleMentionInput(e) {
    const input = e.target;
    const val = input.value;
    const lastWord = val.split(' ').pop();
    
    if (lastWord.startsWith('@')) {
        const query = lastWord.substring(1).toLowerCase();
        // filter current board members
        const matches = currentBoard.members
            .map(id => users.find(u => u._id === id))
            .filter(u => u && u.username.toLowerCase().includes(query));
            
        if (matches.length > 0) {
            mentionDropdown.innerHTML = '';
            matches.forEach(u => {
                const div = document.createElement('div');
                div.className = 'mention-item';
                div.textContent = u.username;
                div.onclick = () => {
                    const words = val.split(' ');
                    words.pop();
                    input.value = words.join(' ') + ' @' + u.username + ' ';
                    mentionDropdown.style.display = 'none';
                    input.focus();
                };
                mentionDropdown.appendChild(div);
            });
            mentionDropdown.style.display = 'block';
        } else {
            mentionDropdown.style.display = 'none';
        }
    } else {
        mentionDropdown.style.display = 'none';
    }
}

// --- Chat Panel ---
function toggleChatPanel() {
    chatPanel.classList.toggle('open');
    if (chatPanel.classList.contains('open')) {
        fetchChatHistory();
        setTimeout(() => document.getElementById('chat-input').focus(), 300);
    }
}

async function fetchChatHistory() {
    if (!currentBoard) return;
    try {
        const res = await fetchWithAuth(`${API_URL}/boards/${currentBoard._id}/chat`);
        const msgs = await res.json();
        renderChatMessages(msgs);
    } catch(e){}
}

function renderChatMessages(msgs) {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    msgs.forEach(appendChatMessage);
}

function appendChatMessage(msg) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `chat-message ${msg.userId === currentUser.id ? 'self' : ''}`;
    div.innerHTML = `
        <div class="chat-message-author">${escapeHTML(msg.username)}</div>
        <div class="chat-message-bubble">${escapeHTML(msg.text)}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function handleChatKeypress(e) {
    if (e.key === 'Enter') sendChatMessage();
    else socket.emit('typing-chat', currentBoard._id);
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if(!text || !currentBoard) return;
    
    try {
        await fetchWithAuth(`${API_URL}/boards/${currentBoard._id}/chat`, {
            method: 'POST',
            body: JSON.stringify({ text })
        });
        input.value = '';
    } catch(e){}
}

// --- Notifications ---
async function fetchNotifications() {
    try {
        const res = await fetchWithAuth(`${API_URL}/notifications`);
        const notifs = await res.json();
        renderNotifications(notifs);
    } catch(e){}
}

function toggleNotifications() {
    notifDropdown.style.display = notifDropdown.style.display === 'none' ? 'block' : 'none';
}

function renderNotifications(notifs) {
    const list = document.getElementById('notif-list');
    list.innerHTML = '';
    unreadNotificationsCount = 0;
    
    if(notifs.length === 0) {
        list.innerHTML = '<div class="notification-item">No notifications</div>';
    } else {
        notifs.forEach(n => {
            if(!n.read) unreadNotificationsCount++;
            const div = document.createElement('div');
            div.className = `notification-item ${n.read ? '' : 'unread'}`;
            div.textContent = n.text;
            list.appendChild(div);
        });
    }
    
    const badge = document.getElementById('notif-badge');
    badge.textContent = unreadNotificationsCount;
    badge.style.display = unreadNotificationsCount > 0 ? 'inline-block' : 'none';
}

async function markAllNotificationsRead() {
    try {
        await fetchWithAuth(`${API_URL}/notifications/read`, { method: 'PUT' });
        fetchNotifications();
    } catch(e){}
}

// --- Profile Modal ---
function openProfileModal() {
    document.getElementById('profile-username').value = currentUser.username;
    
    const img = document.getElementById('profile-avatar-preview');
    const init = document.getElementById('profile-initials-preview');
    
    if (currentUser.avatarUrl) {
        img.src = currentUser.avatarUrl;
        img.style.display = 'block';
        init.style.display = 'none';
    } else {
        img.style.display = 'none';
        init.textContent = currentUser.username[0].toUpperCase();
        init.style.display = 'flex';
    }
    
    profileModal.style.display = 'flex';
}
function closeProfileModal() { profileModal.style.display = 'none'; }

async function uploadAvatar() {
    const input = document.getElementById('avatar-file-input');
    if (!input.files[0]) return showToast('Please select an image');
    
    const formData = new FormData();
    formData.append('avatar', input.files[0]);
    
    try {
        const res = await fetchWithAuth(`${API_URL}/users/profile`, {
            method: 'POST',
            body: formData
        });
        if(res.ok) {
            const data = await res.json();
            currentUser.avatarUrl = data.avatarUrl;
            localStorage.setItem('avatarUrl', data.avatarUrl);
            openProfileModal(); // refresh previews
            renderNavbarAvatar();
            showToast('Avatar updated');
        }
    } catch(e) { showToast('Upload failed'); }
}

function renderNavbarAvatar() {
    const img = document.getElementById('nav-avatar');
    const init = document.getElementById('nav-initials');
    document.getElementById('current-username').textContent = currentUser.username;
    
    if (currentUser.avatarUrl) {
        img.src = currentUser.avatarUrl;
        img.style.display = 'block';
        init.style.display = 'none';
    } else {
        img.style.display = 'none';
        init.textContent = currentUser.username[0].toUpperCase();
        init.style.display = 'flex';
    }
}

// --- Socket.io ---
function initSocket() {
    if (socket) socket.disconnect();
    
    socket = io({ auth: { token: currentUser.token } });
    
    socket.on('task-created', (task) => {
        tasksData[task._id] = task;
        renderTasks(Object.values(tasksData));
    });
    
    socket.on('task-updated', (task) => {
        tasksData[task._id] = task;
        renderTasks(Object.values(tasksData));
        if (document.getElementById('task-id').value === task._id && document.getElementById('task-save-status').textContent !== 'Saving...') {
            // Only update fields if not actively typing to prevent overwriting user input
            // For simplicity in this demo, we assume full sync
        }
    });
    
    socket.on('task-deleted', (taskId) => {
        delete tasksData[taskId];
        renderTasks(Object.values(tasksData));
    });
    
    socket.on('comment-added', (comment) => {
        if (document.getElementById('task-id').value === comment.taskId) {
            const list = document.getElementById('comments-list');
            const div = document.createElement('div');
            div.className = 'comment';
            div.innerHTML = `
                <div class="comment-author">${escapeHTML(comment.username)} - ${new Date(comment.createdAt).toLocaleString()}</div>
                <div class="comment-text">${highlightMentions(escapeHTML(comment.text))}</div>
            `;
            list.appendChild(div);
            list.scrollTop = list.scrollHeight;
        }
    });
    
    socket.on('chat-message', (msg) => {
        if(chatPanel.classList.contains('open')) {
            appendChatMessage(msg);
        } else {
            showToast(`New message from ${msg.username}`);
        }
    });
    
    socket.on('new-notification', (notif) => {
        fetchNotifications();
        showToast(notif.text);
    });
    
    socket.on('board-updated', (board) => {
        if(currentBoard && currentBoard._id === board._id) {
            currentBoard = board;
            if (boardSettingsModal.style.display === 'flex') {
                renderBoardMembers();
            }
            populateTaskAssigneeDropdown();
        }
        fetchBoards(); // refresh sidebar just in case
    });
    
    socket.on('file-uploaded', (f) => {
        if(boardFilesModal.style.display === 'flex') {
            fetchBoardFiles();
        } else {
            showToast(`New file uploaded to project: ${f.filename}`);
        }
    });
    
    socket.on('users-online', (usersList) => {
        const container = document.getElementById('online-users-container');
        container.innerHTML = '';
        usersList.forEach(u => {
            if(u.avatarUrl) {
                container.innerHTML += `<img src="${u.avatarUrl}" class="avatar-small" title="${u.username}">`;
            } else {
                container.innerHTML += `<div class="avatar-initials-small" title="${u.username}">${u.username[0].toUpperCase()}</div>`;
            }
        });
    });
}

// --- Utilities ---
function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 3000);
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
}
