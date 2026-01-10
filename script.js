// Configuration
const API_URL = 'https://script.google.com/macros/s/AKfycbzlgNFsR_ddTvcWGqtKdI0KaFPwe2KgToYfzKUF2aqVvNEmQmQrYU0x6XZBsPeZvDCi/exec';


// State
let currentDate = new Date();
let selectedDate = null;
let tasks = [];
let clients = [];
let editingTaskId = null;
let editingClientId = null;
let currentFilter = 'all';
let currentClientFilter = 'all';
let currentUser = null;
let syncTimeout = null;

// Initialize
function init() {
    const storedUser = localStorage.getItem('vaSchedulerUser');
    if (!storedUser) {
        window.location.href = 'index.html';
        return;
    }
    
    currentUser = JSON.parse(storedUser);
    loadTheme(); // Load theme before anything else
    loadTasks();
    loadClients();
    
    updateUserDisplay();
    renderDashboard();
    renderCalendar();
    renderAllTasks();
    renderClients();
    setupNavigation();
    updateClientSelectors();
    
    // Set today's date
    const today = formatDate(new Date());
    document.getElementById('taskDate').value = today;
    document.getElementById('taskDate').min = today;
    
    // Update current date display
    updateCurrentDate();
    
    // Check account status periodically
    setInterval(checkAccountStatus, 60000);

    // New additions
    loadAlarmSettings();
    loadProfileSettings();
    renderThemes();
    updateReminderClientSelectors();
    setInterval(checkReminders, 60000);
    checkReminders();
    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
}

// API Calls
async function apiCall(action, data = {}) {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action, ...data }),
            redirect: 'follow'
        });
        return JSON.parse(await response.text());
    } catch (e) {
        return { success: false, message: 'Connection error' };
    }
}

async function checkAccountStatus() {
    if (!currentUser?.userId) return;
    
    const result = await apiCall('checkStatus', { userId: currentUser.userId });
    
    if (!result.success || result.revoked) {
        alert('Your account has been suspended. Please contact the administrator.');
        logout();
    }
}

// Local Storage Functions
function loadTasks() {
    tasks = JSON.parse(localStorage.getItem('schedulerTasks') || '[]');
}

function saveTasks() {
    localStorage.setItem('schedulerTasks', JSON.stringify(tasks));
    syncToCloud();
}

function loadClients() {
    clients = JSON.parse(localStorage.getItem('schedulerClients') || '[]');
}

function saveClients() {
    localStorage.setItem('schedulerClients', JSON.stringify(clients));
    syncToCloud();
}

async function syncToCloud() {
    if (!currentUser?.userId) return;
    if (syncTimeout) clearTimeout(syncTimeout);
    
    syncTimeout = setTimeout(async () => {
        const result = await apiCall('saveData', {
            userId: currentUser.userId,
            userData: { tasks, clients }
        });
    }, 2000);
}

// Navigation
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            switchPage(page);
            
            // Hide mobile menu after clicking (on mobile devices)
            if (window.innerWidth <= 768) {
                setTimeout(() => {
                    document.querySelector('.sidebar').classList.remove('active');
                    document.querySelector('.mobile-menu-toggle').classList.remove('active');
                }, 1000);
            }
        });
    });
}

function switchPage(pageName) {
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageName) {
            item.classList.add('active');
        }
    });
    
    // Update active page
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    document.getElementById(pageName + 'Page').classList.add('active');
    
    // Update page title
    const titles = {
        dashboard: 'Dashboard',
        tasks: 'Tasks',
        reminders: 'Reminders',
        schedule: 'Schedule',
        clients: 'Clients',
        settings: 'Settings'
    };
    document.getElementById('pageTitle').textContent = titles[pageName] || pageName;
    
    // Refresh content
    if (pageName === 'dashboard') renderDashboard();
    if (pageName === 'schedule') renderCalendar();
    if (pageName === 'tasks') renderAllTasks();
    if (pageName === 'clients') renderClients();
    if (pageName === 'reminders') renderReminders();
    if (pageName === 'settings') {
    // Settings now use modals, no need to load data here
}
    /*if (pageName === 'settings') {
        renderThemes();
        loadAlarmSettings();
        loadProfileSettings();
    } */
}

// User Display
function updateUserDisplay() {
    if (currentUser) {
        document.getElementById('userName').textContent = currentUser.fullName || 'User';
        document.getElementById('userEmail').textContent = currentUser.email || '';
    }
}

function updateCurrentDate() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('en-US', options);
}

// Dashboard
function renderDashboard() {
    const today = formatDate(new Date());
    const todayTasks = tasks.filter(t => t.date === today);
    const activeTasks = tasks.filter(t => t.date >= today);
    const upcomingWeek = getUpcomingWeek();
    
    // Update stats
    document.getElementById('activeTasks').textContent = activeTasks.length;
    document.getElementById('todayTasks').textContent = todayTasks.length;
    document.getElementById('pendingReminders').textContent = todayTasks.filter(t => t.reminder > 0).length;
    document.getElementById('totalClients').textContent = clients.length;
    
    // Render today's tasks
    renderTodayTasks(todayTasks);
    
    // Render today's reminders
    renderTodayReminders(todayTasks.filter(t => t.reminder > 0));
    
    // Render upcoming week
    renderUpcomingWeek(upcomingWeek);
}

function renderTodayTasks(todayTasks) {
    const container = document.getElementById('todayTasksList');
    
    if (todayTasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🎉</span>
                <p>No tasks for today. Great job!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = todayTasks.map(task => {
        const client = clients.find(c => c.id === task.clientId);
        return `
            <div class="task-item">
                <div class="task-item-header">
                    <div class="task-item-title">${escapeHtml(task.title)}</div>
                    <span class="task-badge ${task.urgency}">${task.urgency}</span>
                </div>
                <div class="task-item-meta">
                    <span>🕐 ${formatTime(task.startTime)}</span>
                    <span>👤 ${client ? escapeHtml(client.name) : 'No client'}</span>
                </div>
            </div>
        `;
    }).join('');
}

function renderTodayReminders(todayReminders) {
    const container = document.getElementById('todayRemindersList');
    
    if (todayReminders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🔔</span>
                <p>No reminders for today</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = todayReminders.map(task => `
        <div class="task-item">
            <div class="task-item-header">
                <div class="task-item-title">${escapeHtml(task.title)}</div>
                <span class="task-badge ${task.urgency}">${task.urgency}</span>
            </div>
            <div class="task-item-meta">
                <span>🕐 ${formatTime(task.startTime)}</span>
                <span>⏰ ${task.reminder} min before</span>
            </div>
        </div>
    `).join('');
}

function getUpcomingWeek() {
    const today = new Date();
    const week = [];
    for (let i = 1; i <= 7; i++) {
        const day = new Date(today);
        day.setDate(today.getDate() + i);
        week.push({
            date: formatDate(day),
            dayName: day.toLocaleDateString('en-US', { weekday: 'long' }),
            tasks: tasks.filter(t => t.date === formatDate(day))
        });
    }
    return week;
}

function renderUpcomingWeek(upcomingWeek) {
    const container = document.getElementById('upcomingWeekList');
    
    if (upcomingWeek.every(d => d.tasks.length === 0)) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📅</span>
                <p>No upcoming tasks this week</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = upcomingWeek.map(day => {
        if (day.tasks.length === 0) return '';
        
        return `
            <div class="upcoming-day">
                <div class="upcoming-day-header">
                    <span>${day.dayName}</span>
                    <span>${formatDateDisplay(day.date)}</span>
                </div>
                ${day.tasks.map(task => `
                    <div class="task-item">
                        <div class="task-item-header">
                            <div class="task-item-title">${escapeHtml(task.title)}</div>
                            <span class="task-badge ${task.urgency}">${task.urgency}</span>
                        </div>
                        <div class="task-item-meta">
                            <span>🕐 ${formatTime(task.startTime)}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');
}

// Tasks
function renderAllTasks() {
    const container = document.getElementById('allTasksList');
    
    let filteredTasks = tasks.filter(t => t.date >= formatDate(new Date()));
    
    if (currentFilter !== 'all') {
        filteredTasks = filteredTasks.filter(t => t.urgency === currentFilter);
    }
    
    if (currentClientFilter !== 'all') {
        filteredTasks = filteredTasks.filter(t => t.clientId === currentClientFilter);
    }
    
    if (filteredTasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📝</span>
                <p>No tasks yet. Create one to stay organized! 🗂️</p>
            </div>
        `;
        return;
    }
    
    filteredTasks.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    container.innerHTML = filteredTasks.map(task => {
        const client = clients.find(c => c.id === task.clientId);
        return `
            <div class="task-item">
                <div class="task-item-header">
                    <div class="task-item-title">${escapeHtml(task.title)}</div>
                    <span class="task-badge ${task.urgency}">${task.urgency}</span>
                </div>
                <div class="task-item-meta">
                    <span>📅 ${formatDateDisplay(task.date)}</span>
                    <span>🕐 ${formatTime(task.startTime)}</span>
                    <span>👤 ${client ? escapeHtml(client.name) : 'No client'}</span>
                </div>
                <div class="task-item-actions">
                    <button class="btn btn-secondary btn-small" onclick="editTask('${task.id}')">Edit</button>
                    <button class="btn btn-danger btn-small" onclick="deleteTask('${task.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

// Filter Listeners
document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentFilter = pill.dataset.urgency;
        renderAllTasks();
    });
});

document.getElementById('taskClientFilter').addEventListener('change', (e) => {
    currentClientFilter = e.target.value;
    renderAllTasks();
});

document.getElementById('showCompletedTasks').addEventListener('change', () => {
    // Implement if completed tasks are added
});

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Update month display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    document.getElementById('calendarMonth').textContent = `${monthNames[month]} ${year}`;
    
    const container = document.getElementById('calendarDays');
    let html = '';
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    // Previous month filler days
    for (let i = firstDay; i > 0; i--) {
        const prevDay = daysInPrevMonth - i + 1;
        html += `<div class="calendar-day other-month">
            <div class="calendar-day-number">${prevDay}</div>
        </div>`;
    }
    
    // Current month days
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDate(date);
        const isToday = date.toDateString() === today.toDateString();
        
        const dayTasks = tasks.filter(t => t.date === dateStr);
        const hasEvent = dayTasks.length > 0;
        
        let dot = '';
        if (hasEvent) {
            dot = `<div class="event-dot${dayTasks.length > 1 ? ' multiple' : ''}"></div>`;
        }
        
        html += `<div class="calendar-day ${isToday ? 'today' : ''}" onclick="openAddTaskOnDate('${dateStr}')">
            <div class="calendar-day-number">${day}</div>
            ${dot}
        </div>`;
    }
    
    // Next month filler
    const totalCells = firstDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remaining; i++) {
        html += `<div class="calendar-day other-month">
            <div class="calendar-day-number">${i}</div>
        </div>`;
    }
    
    container.innerHTML = html;
    
    renderUpcomingEvents();
}

function renderUpcomingEvents() {
    const today = new Date();
    const upcomingTasks = tasks
        .filter(t => new Date(t.date + 'T00:00:00') >= today)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 5);
   
    const container = document.getElementById('upcomingTasksList');
   
    if (upcomingTasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📅</span>
                <p>No upcoming tasks</p>
            </div>
        `;
        return;
    }
   
    container.innerHTML = upcomingTasks.map(task => {
        const client = clients.find(c => c.id === task.clientId);
        return `
            <div class="upcoming-item">
                <div class="upcoming-item-title">${escapeHtml(task.title)}</div>
                <div class="upcoming-item-time">
                    ${formatDateDisplay(task.date)} at ${formatTime(task.startTime)}
                </div>
                ${client ? `<div class="upcoming-item-client">👤 ${escapeHtml(client.name)}</div>` : ''}
            </div>
        `;
    }).join('');
}

function prevMonth() {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
}

function nextMonth() {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
}
// CONTINUE FROM PART 1 - Add this after prevMonth() and nextMonth()======================================================================================================================================

// Task Modal
function openAddTaskModal() {
    editingTaskId = null;
    document.getElementById('modalTitle').textContent = 'Add Task';
    document.getElementById('taskForm').reset();
    document.getElementById('taskDate').value = formatDate(new Date());
    document.getElementById('taskModal').classList.add('active');
}

function editTask(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    
    editingTaskId = id;
    document.getElementById('modalTitle').textContent = 'Edit Task';
    document.getElementById('taskClient').value = task.clientId || '';
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskDate').value = task.date;
    document.getElementById('taskStartTime').value = task.startTime;
    document.getElementById('taskEndTime').value = task.endTime || '';
    document.getElementById('taskUrgency').value = task.urgency;
    document.getElementById('taskReminder').value = task.reminder || 0;
    
    document.getElementById('taskModal').classList.add('active');
}

function closeTaskModal() {
    document.getElementById('taskModal').classList.remove('active');
}

function saveTask(e) {
    e.preventDefault();
    
    const data = {
        id: editingTaskId || generateId(),
        clientId: document.getElementById('taskClient').value,
        title: document.getElementById('taskTitle').value,
        description: document.getElementById('taskDescription').value,
        date: document.getElementById('taskDate').value,
        startTime: document.getElementById('taskStartTime').value,
        endTime: document.getElementById('taskEndTime').value,
        urgency: document.getElementById('taskUrgency').value,
        reminder: parseInt(document.getElementById('taskReminder').value),
        createdAt: editingTaskId 
            ? tasks.find(t => t.id === editingTaskId).createdAt 
            : new Date().toISOString(),
        alerted: false
    };
    
    if (editingTaskId) {
        const index = tasks.findIndex(t => t.id === editingTaskId);
        if (index !== -1) tasks[index] = data;
    } else {
        tasks.push(data);
    }
    
    saveTasks();
    closeTaskModal();
    renderDashboard();
    renderCalendar();
    renderAllTasks();
    showToast('Task saved successfully!', 'success');
}

function deleteTask(id) {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    renderDashboard();
    renderCalendar();
    renderAllTasks();
    showToast('Task deleted', 'success');
}

// Clients
function renderClients() {
    const container = document.getElementById('clientsList');
    
    if (clients.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">👥</span>
                <p>No clients yet</p>
            </div>
        `;
        return;
    }
    
    const sortedClients = [...clients].sort((a, b) => a.name.localeCompare(b.name));
    
    container.innerHTML = sortedClients.map(client => {
        const clientTasks = tasks.filter(t => t.clientId === client.id);
        return `
            <div class="client-card">
                <div class="client-name">${escapeHtml(client.name)}</div>
                ${client.email ? `<div class="client-info">📧 ${escapeHtml(client.email)}</div>` : ''}
                ${client.phone ? `<div class="client-info">📱 ${escapeHtml(client.phone)}</div>` : ''}
                <div class="client-task-count">${clientTasks.length} task${clientTasks.length !== 1 ? 's' : ''}</div>
                <div class="client-actions">
                    <button class="btn btn-secondary btn-small" onclick="editClient('${client.id}')">Edit</button>
                    <button class="btn btn-danger btn-small" onclick="deleteClient('${client.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function updateClientSelectors() {
    const options = [...clients]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
        .join('');
    
    document.getElementById('taskClient').innerHTML = '<option value="">Select client</option>' + options;
    document.getElementById('taskClientFilter').innerHTML = '<option value="all">All Clients</option>' + options;
    document.getElementById('reminderClient').innerHTML = '<option value="">Select client</option>' + options;
}

function openAddClientModal() {
    editingClientId = null;
    document.getElementById('clientModalTitle').textContent = 'Add Client';
    document.getElementById('clientForm').reset();
    document.getElementById('clientModal').classList.add('active');
}

function editClient(id) {
    const client = clients.find(c => c.id === id);
    if (!client) return;
    
    editingClientId = id;
    document.getElementById('clientModalTitle').textContent = 'Edit Client';
    document.getElementById('clientName').value = client.name;
    document.getElementById('clientEmail').value = client.email || '';
    document.getElementById('clientPhone').value = client.phone || '';
    document.getElementById('clientNotes').value = client.notes || '';
    
    document.getElementById('clientModal').classList.add('active');
}

function closeClientModal() {
    document.getElementById('clientModal').classList.remove('active');
    editingClientId = null;
}

function saveClient(e) {
    e.preventDefault();
    
    const data = {
        id: editingClientId || generateId(),
        name: document.getElementById('clientName').value,
        email: document.getElementById('clientEmail').value,
        phone: document.getElementById('clientPhone').value,
        notes: document.getElementById('clientNotes').value,
        createdAt: editingClientId 
            ? clients.find(c => c.id === editingClientId).createdAt 
            : new Date().toISOString()
    };
    
    if (editingClientId) {
        const index = clients.findIndex(c => c.id === editingClientId);
        if (index !== -1) clients[index] = data;
    } else {
        clients.push(data);
    }
    
    saveClients();
    closeClientModal();
    renderClients();
    updateClientSelectors();
    renderDashboard();
    showToast('Client saved successfully!', 'success');
}

function deleteClient(id) {
    const client = clients.find(c => c.id === id);
    const clientTasks = tasks.filter(t => t.clientId === id);
    
    if (clientTasks.length > 0) {
        if (!confirm(`Delete ${client.name} and ${clientTasks.length} associated task(s)?`)) return;
        tasks = tasks.filter(t => t.clientId !== id);
        saveTasks();
    } else {
        if (!confirm(`Delete ${client.name}?`)) return;
    }
    
    clients = clients.filter(c => c.id !== id);
    saveClients();
    renderClients();
    renderDashboard();
    renderCalendar();
    renderAllTasks();
    updateClientSelectors();
    showToast('Client deleted', 'success');
}

// Utility Functions
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(dateStr) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function logout() {
    if (!confirm('Are you sure you want to logout?')) return;
    
    ['vaSchedulerUser', 'schedulerTasks', 'schedulerClients', 'schedulerProfile', 'schedulerTheme', 'schedulerHasVisited', 'verified'].forEach(key => {
        localStorage.removeItem(key);
    });
    
    window.location.href = 'index.html';
}

// Modal Close on Outside Click
document.addEventListener('click', (e) => {
    if (e.target.id === 'taskModal') closeTaskModal();
    if (e.target.id === 'clientModal') closeClientModal();
    if (e.target.id === 'reminderModal') closeReminderModal();
});

// Reminders and Alarms
let alarmSettings = {
    sound: 'default',
    customUrl: ''
};

const soundUrls = {
    default: 'https://www.soundjay.com/buttons/beep-07.mp3',
    chime: 'https://www.soundjay.com/buttons/chime.mp3',
    bell: 'https://www.soundjay.com/buttons/bell.mp3'
};

function loadAlarmSettings() {
    const stored = localStorage.getItem('schedulerAlarmSettings') || '{}';
    alarmSettings = JSON.parse(stored);
    document.getElementById('alarmSound').value = alarmSettings.sound || 'default';
    if (alarmSettings.sound === 'custom') {
        document.getElementById('customSoundGroup').style.display = 'block';
        document.getElementById('customSoundUrl').value = alarmSettings.customUrl || '';
    }
    
    // Add change listener
    document.getElementById('alarmSound').addEventListener('change', function() {
        const selectedSound = this.value;
        
        if (selectedSound === 'custom') {
            document.getElementById('customSoundGroup').style.display = 'block';
        } else {
            document.getElementById('customSoundGroup').style.display = 'none';
        }
        
        // Play preview of selected sound
        playAlarmPreview(selectedSound);
    });
}

function playAlarmPreview(soundType) {
    const soundUrl = soundType === 'custom' 
        ? document.getElementById('customSoundUrl').value 
        : soundUrls[soundType];
    
    if (!soundUrl) {
        showToast('Please enter a custom sound URL first', 'warning');
        return;
    }
    
    const audio = new Audio(soundUrl);
    audio.volume = 0.5; // Set to 50% volume for preview
    audio.play().catch(e => {
        console.log('Audio play failed:', e);
        showToast('Failed to play sound. Please check the URL.', 'error');
    });
}

function saveAlarmSettings() {
    alarmSettings.sound = document.getElementById('alarmSound').value;
    if (alarmSettings.sound === 'custom') {
        alarmSettings.customUrl = document.getElementById('customSoundUrl').value;
    }
    localStorage.setItem('schedulerAlarmSettings', JSON.stringify(alarmSettings));
    showToast('Alarm settings saved!', 'success');
}

function renderReminders() {
    const container = document.getElementById('remindersList');
    
    const reminders = tasks.filter(t => t.reminder > 0);
    
    if (reminders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📝</span>
                <p>No reminders yet. Create one to stay organized! 🗂️</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = reminders.map(task => {
        const client = clients.find(c => c.id === task.clientId);
        return `
            <div class="task-item">
                <div class="task-item-header">
                    <div class="task-item-title">${escapeHtml(task.title)}</div>
                    <span class="task-badge ${task.urgency}">${task.urgency}</span>
                </div>
                <div class="task-item-meta">
                    <span>🕐 ${formatTime(task.startTime)}</span>
                    <span>⏰ ${task.reminder} min before</span>
                    <span>👤 ${client ? escapeHtml(client.name) : 'No client'}</span>
                </div>
            </div>
        `;
    }).join('');
}

function openAddReminderModal() {
    editingTaskId = null;
    document.getElementById('reminderForm').reset();
    document.getElementById('reminderDate').value = formatDate(new Date());
    document.getElementById('reminderDate').min = formatDate(new Date());
    updateReminderClientSelectors();
    document.getElementById('reminderModal').classList.add('active');
}

function closeReminderModal() {
    document.getElementById('reminderModal').classList.remove('active');
}

function saveReminder(e) {
    e.preventDefault();
    
    const data = {
        id: editingTaskId || generateId(),
        clientId: document.getElementById('reminderClient').value,
        title: document.getElementById('reminderTitle').value,
        description: document.getElementById('reminderDescription').value,
        date: document.getElementById('reminderDate').value,
        startTime: document.getElementById('reminderStartTime').value,
        endTime: document.getElementById('reminderEndTime').value,
        urgency: document.getElementById('reminderUrgency').value,
        reminder: parseInt(document.getElementById('reminderReminder').value),
        alerted: false
    };
    
    if (editingTaskId) {
        const index = tasks.findIndex(t => t.id === editingTaskId);
        tasks[index] = data;
    } else {
        tasks.push(data);
    }
    
    saveTasks();
    closeReminderModal();
    renderReminders();
    renderDashboard();
    showToast('Reminder saved successfully!', 'success');
}

function updateReminderClientSelectors() {
    const options = [...clients]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
        .join('');
    
    document.getElementById('reminderClient').innerHTML = '<option value="">Select client</option>' + options;
}

function checkReminders() {
    const now = new Date();
    tasks.forEach(task => {
        if (task.reminder > 0 && !task.alerted) {
            const taskTime = new Date(`${task.date}T${task.startTime}`);
            const alertTime = new Date(taskTime.getTime() - task.reminder * 60000);
            if (now >= alertTime) {
                const audio = new Audio(alarmSettings.sound === 'custom' ? alarmSettings.customUrl : soundUrls[alarmSettings.sound]);
                audio.play().catch(e => console.log('Audio play failed:', e));
                
                if (Notification.permission === 'granted') {
                    new Notification('Reminder', { body: task.title });
                }
                
                task.alerted = true;
                saveTasks();
            }
        }
    });
}

function toggleMobileMenu() {
    document.querySelector('.sidebar').classList.toggle('active');
    document.querySelector('.mobile-menu-toggle').classList.toggle('active');
}

function openAddTaskOnDate(dateStr) {
    openAddTaskModal();
    document.getElementById('taskDate').value = dateStr;
}

function selectDate(dateStr) {
    selectedDate = dateStr;
    openAddTaskModal();
    document.getElementById('taskDate').value = dateStr;
    showToast(`Selected date: ${formatDateDisplay(dateStr)}`, 'success');
}

// Theme System
function renderThemes() {
    const options = [
        {name: 'Default', color: 'linear-gradient(135deg, #a855f7, #ec4899)'},
        {name: 'Dark', color: 'linear-gradient(135deg, #1f2937, #374151)'},
        {name: 'Ocean', color: 'linear-gradient(135deg, #0ea5e9, #06b6d4)'},
        {name: 'Forest', color: 'linear-gradient(135deg, #059669, #10b981)'},
        {name: 'Sunset', color: 'linear-gradient(135deg, #f59e0b, #ef4444)'}
    ];
    
    const currentTheme = localStorage.getItem('schedulerTheme') || 'Default';
    
    document.getElementById('themeGrid').innerHTML = options.map(o => `
        <div class="theme-option ${currentTheme === o.name ? 'active' : ''}" 
             style="background: ${o.color};" 
             onclick="applyTheme('${o.name}')">
            ${o.name}
        </div>
    `).join('');
}

function applyTheme(themeName) {
    const themes = {
        'Default': {
            '--primary': '#c74ad5',
            '--primary-light': '#e88bf5',
            '--primary-dark': '#a93bb8',
            '--bg-primary': '#f5f7fa',
            '--bg-secondary': '#ffffff',
            '--text-primary': '#1f2937',
            '--text-secondary': '#6b7280',
            '--text-light': '#9ca3af',
            '--border': '#e5e7eb'
        },
        'Dark': {
            '--primary': '#8b5cf6',
            '--primary-light': '#a78bfa',
            '--primary-dark': '#7c3aed',
            '--bg-primary': '#1e293b',
            '--bg-secondary': '#0f172a',
            '--text-primary': '#f1f5f9',
            '--text-secondary': '#cbd5e1',
            '--text-light': '#94a3b8',
            '--border': '#334155'
        },
        'Ocean': {
            '--primary': '#0ea5e9',
            '--primary-light': '#38bdf8',
            '--primary-dark': '#0284c7',
            '--bg-primary': '#f0f9ff',
            '--bg-secondary': '#ffffff',
            '--text-primary': '#0c4a6e',
            '--text-secondary': '#0369a1',
            '--text-light': '#0891b2',
            '--border': '#e0f2fe'
        },
        'Forest': {
            '--primary': '#059669',
            '--primary-light': '#10b981',
            '--primary-dark': '#047857',
            '--bg-primary': '#f0fdf4',
            '--bg-secondary': '#ffffff',
            '--text-primary': '#064e3b',
            '--text-secondary': '#065f46',
            '--text-light': '#059669',
            '--border': '#d1fae5'
        },
        'Sunset': {
            '--primary': '#f59e0b',
            '--primary-light': '#fbbf24',
            '--primary-dark': '#d97706',
            '--bg-primary': '#fffbeb',
            '--bg-secondary': '#ffffff',
            '--text-primary': '#78350f',
            '--text-secondary': '#92400e',
            '--text-light': '#b45309',
            '--border': '#fef3c7'
        }
    };
    
    const theme = themes[themeName];
    if (theme) {
        const root = document.documentElement;
        Object.keys(theme).forEach(key => {
            root.style.setProperty(key, theme[key]);
        });
        
        localStorage.setItem('schedulerTheme', themeName);
        apiCall('saveTheme', { userId: currentUser.userId, theme: themeName });
        renderThemes();
        showToast(`Theme changed to ${themeName}`, 'success');
    }
}

function loadTheme() {
    const savedTheme = localStorage.getItem('schedulerTheme') || 'Default';
    applyTheme(savedTheme);
}

// Profile and Account Settings
function loadProfileSettings() {
    if (currentUser) {
        document.getElementById('profileName').value = currentUser.fullName || '';
        document.getElementById('profileEmail').value = currentUser.email || '';
        document.getElementById('currentUsername').value = currentUser.username || '';
    }
}

function saveProfile() {
    const newName = document.getElementById('profileName').value.trim();
    
    if (!newName) {
        showToast('Name cannot be empty', 'error');
        return;
    }
    
    currentUser.fullName = newName;
    localStorage.setItem('vaSchedulerUser', JSON.stringify(currentUser));
    updateUserDisplay();
    
    showToast('Profile updated successfully!', 'success');
}

async function changeUsername() {
    const newUsername = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('usernamePassword').value;
    
    if (!newUsername || !password) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    if (newUsername.length < 3) {
        showToast('Username must be at least 3 characters', 'error');
        return;
    }
    
    const checkResult = await apiCall('checkUsername', { username: newUsername });
    if (!checkResult.available) {
        showToast('Username already taken', 'error');
        return;
    }
    
    const result = await apiCall('changeUsername', {
        userId: currentUser.userId,
        newUsername: newUsername,
        password: password
    });
    
    if (result.success) {
        currentUser.username = newUsername;
        localStorage.setItem('vaSchedulerUser', JSON.stringify(currentUser));
        document.getElementById('currentUsername').value = newUsername;
        document.getElementById('newUsername').value = '';
        document.getElementById('usernamePassword').value = '';
        showToast('Username changed successfully!', 'success');
    } else {
        showToast(result.message || 'Failed to change username', 'error');
    }
}

async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    if (newPassword.length < 6) {
        showToast('New password must be at least 6 characters', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match', 'error');
        return;
    }
    
    const result = await apiCall('changePassword', {
        userId: currentUser.userId,
        currentPassword: currentPassword,
        newPassword: newPassword
    });
    
    if (result.success) {
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        showToast('Password changed successfully!', 'success');
    } else {
        showToast(result.message || 'Failed to change password', 'error');
    }
}

// Export Functions
function exportTasks() {
    const dataStr = JSON.stringify({tasks, clients}, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scheduler-data-${formatDate(new Date())}.json`;
    link.click();
    showToast('Data exported successfully!', 'success');
}

function exportTasksICS() {
    showToast('ICS export coming soon!', 'info');
}

// additional
// ADD THESE FUNCTIONS TO YOUR script.js

// Theme Modal Functions
function openThemeModal() {
    renderThemes();
    document.getElementById('themeModal').classList.add('active');
}

function closeThemeModal() {
    document.getElementById('themeModal').classList.remove('active');
}

// Alarm Modal Functions
function openAlarmModal() {
    loadAlarmSettings();
    document.getElementById('alarmModal').classList.add('active');
}

function closeAlarmModal() {
    document.getElementById('alarmModal').classList.remove('active');
}

// Profile Modal Functions
function openProfileModal() {
    loadProfileSettings();
    document.getElementById('profileModal').classList.add('active');
}

function closeProfileModal() {
    document.getElementById('profileModal').classList.remove('active');
}

// Username Modal Functions
function openUsernameModal() {
    loadProfileSettings();
    document.getElementById('usernameModal').classList.add('active');
}

function closeUsernameModal() {
    document.getElementById('usernameModal').classList.remove('active');
    // Clear fields
    document.getElementById('newUsername').value = '';
    document.getElementById('usernamePassword').value = '';
}

async function changeUsernameAndClose() {
    await changeUsername();
    // Only close if successful
    const newUsername = document.getElementById('newUsername').value.trim();
    if (newUsername && currentUser.username === newUsername) {
        closeUsernameModal();
    }
}

// Password Modal Functions
function openPasswordModal() {
    document.getElementById('passwordModal').classList.add('active');
}

function closePasswordModal() {
    document.getElementById('passwordModal').classList.remove('active');
    // Clear all password fields
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmPassword').value = '';
}

async function changePasswordAndClose() {
    await changePassword();
    // Check if password fields are cleared (which happens on success)
    if (document.getElementById('currentPassword').value === '') {
        closePasswordModal();
    }
}

// Export Modal Functions
function openExportModal() {
    document.getElementById('exportModal').classList.add('active');
}

function closeExportModal() {
    document.getElementById('exportModal').classList.remove('active');
}

// Update existing exportTasks function to close modal
function exportTasks() {
    const dataStr = JSON.stringify({tasks, clients}, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scheduler-data-${formatDate(new Date())}.json`;
    link.click();
    showToast('Data exported successfully!', 'success');
    closeExportModal();
}

function exportTasksICS() {
    showToast('ICS export coming soon!', 'info');
    closeExportModal();
}

// Update modal close listeners to include new modals
document.addEventListener('click', (e) => {
    if (e.target.id === 'taskModal') closeTaskModal();
    if (e.target.id === 'clientModal') closeClientModal();
    if (e.target.id === 'reminderModal') closeReminderModal();
    if (e.target.id === 'themeModal') closeThemeModal();
    if (e.target.id === 'alarmModal') closeAlarmModal();
    if (e.target.id === 'profileModal') closeProfileModal();
    if (e.target.id === 'usernameModal') closeUsernameModal();
    if (e.target.id === 'passwordModal') closePasswordModal();
    if (e.target.id === 'exportModal') closeExportModal();
});

// REMOVE OR COMMENT OUT the old switchPage settings loading section
// In your switchPage function, replace this:
/*
if (pageName === 'settings') {
    renderThemes();
    loadAlarmSettings();
    loadProfileSettings();
}
*/
// With this (settings no longer need to load on page switch since they're in modals):
//if (pageName === 'settings') {
    // Settings now use modals, no need to load data here
//}

//end addition ===========================================================================================================================================

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
