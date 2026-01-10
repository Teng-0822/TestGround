// Configuration
const API_URL = 'https://script.google.com/macros/s/AKfycbzlgNFsR_ddTvcWGqtKdI0KaFPwe2KgToYfzKUF2aqVvNEmQmQrYU0x6XZBsPeZvDCi/exec';


// State
let currentDate = new Date();
let selectedDate = null;
let tasks = [];
let clients = [];
let reminders = [];
let timesheetEntries = [];
let reminderTypes = ['Meetings', 'Video Call'];
let editingTaskId = null;
let editingClientId = null;
let editingReminderId = null;
let currentFilter = 'all';
let currentClientFilter = 'all';
let currentReminderTypeFilter = 'all';
let currentUser = null;
let syncTimeout = null;

// Sync State
let isOnline = navigator.onLine;
let isSyncing = false;
let pendingSync = false;
let lastSyncTime = null;

// Timesheet State
let activeShift = null;
let shiftTimerInterval = null;
let clientTimeInterval = null;

// Timezone list
const TIMEZONES = [
    { value: 'Pacific/Midway', label: '(GMT-11:00) Midway Island' },
    { value: 'Pacific/Honolulu', label: '(GMT-10:00) Hawaii' },
    { value: 'America/Anchorage', label: '(GMT-09:00) Alaska' },
    { value: 'America/Los_Angeles', label: '(GMT-08:00) Pacific Time (US)' },
    { value: 'America/Denver', label: '(GMT-07:00) Mountain Time (US)' },
    { value: 'America/Chicago', label: '(GMT-06:00) Central Time (US)' },
    { value: 'America/New_York', label: '(GMT-05:00) Eastern Time (US)' },
    { value: 'America/Caracas', label: '(GMT-04:00) Caracas' },
    { value: 'America/Sao_Paulo', label: '(GMT-03:00) Sao Paulo' },
    { value: 'Atlantic/South_Georgia', label: '(GMT-02:00) Mid-Atlantic' },
    { value: 'Atlantic/Azores', label: '(GMT-01:00) Azores' },
    { value: 'Europe/London', label: '(GMT+00:00) London, Dublin' },
    { value: 'Europe/Paris', label: '(GMT+01:00) Paris, Berlin, Rome' },
    { value: 'Europe/Helsinki', label: '(GMT+02:00) Helsinki, Cairo' },
    { value: 'Europe/Moscow', label: '(GMT+03:00) Moscow, Kuwait' },
    { value: 'Asia/Dubai', label: '(GMT+04:00) Dubai, Abu Dhabi' },
    { value: 'Asia/Karachi', label: '(GMT+05:00) Karachi, Islamabad' },
    { value: 'Asia/Kolkata', label: '(GMT+05:30) Mumbai, New Delhi' },
    { value: 'Asia/Dhaka', label: '(GMT+06:00) Dhaka' },
    { value: 'Asia/Bangkok', label: '(GMT+07:00) Bangkok, Jakarta' },
    { value: 'Asia/Singapore', label: '(GMT+08:00) Singapore, Hong Kong' },
    { value: 'Asia/Manila', label: '(GMT+08:00) Manila, Philippines' },
    { value: 'Asia/Tokyo', label: '(GMT+09:00) Tokyo, Seoul' },
    { value: 'Australia/Sydney', label: '(GMT+10:00) Sydney, Melbourne' },
    { value: 'Pacific/Noumea', label: '(GMT+11:00) New Caledonia' },
    { value: 'Pacific/Auckland', label: '(GMT+12:00) Auckland, Wellington' }
];

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
    loadReminders();
    loadReminderTypes();
    loadTimesheetEntries();
    loadActiveShift();
    loadSyncState();
    
    updateUserDisplay();
    renderDashboard();
    renderCalendar();
    renderAllTasks();
    renderClients();
    setupNavigation();
    updateClientSelectors();
    populateTimezoneSelect();
    
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
    updateReminderTypeSelector();
    setInterval(checkReminders, 30000); // Check every 30 seconds
    checkReminders();
    if (Notification.permission !== 'granted') {
        Notification.requestPermission();
    }
    
    // Setup online/offline listeners
    setupConnectivityListeners();
    updateSyncStatusUI();
    
    // Try to sync any pending changes on startup
    if (pendingSync) {
        syncToCloud();
    }
    
    // Resume active shift if exists
    if (activeShift) {
        resumeActiveShift();
    }
}

// API Calls
async function apiCall(action, data = {}) {
    // Check if offline first
    if (!navigator.onLine) {
        return { success: false, message: 'Offline', offline: true };
    }
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action, ...data }),
            redirect: 'follow'
        });
        return JSON.parse(await response.text());
    } catch (e) {
        return { success: false, message: 'Connection error', offline: true };
    }
}

async function checkAccountStatus() {
    if (!currentUser?.userId) return;
    
    // Don't check if offline
    if (!navigator.onLine) return;
    
    try {
        const result = await apiCall('checkStatus', { userId: currentUser.userId });
        
        // Only logout if explicitly revoked, not on network errors
        if (result.success && result.revoked) {
            alert('Your account has been suspended. Please contact the administrator.');
            logout();
        }
    } catch (error) {
        // Network error - just ignore, don't logout
        console.log('Account status check failed (offline?):', error);
    }
}

// Local Storage Functions
function loadTasks() {
    tasks = JSON.parse(localStorage.getItem('schedulerTasks') || '[]');
}

function saveTasks() {
    localStorage.setItem('schedulerTasks', JSON.stringify(tasks));
    markPendingSync();
    syncToCloud();
}

function loadClients() {
    clients = JSON.parse(localStorage.getItem('schedulerClients') || '[]');
}

function saveClients() {
    localStorage.setItem('schedulerClients', JSON.stringify(clients));
    markPendingSync();
    syncToCloud();
}

function loadReminders() {
    reminders = JSON.parse(localStorage.getItem('schedulerReminders') || '[]');
}

function saveReminders() {
    localStorage.setItem('schedulerReminders', JSON.stringify(reminders));
    markPendingSync();
    syncToCloud();
}

function loadReminderTypes() {
    const stored = localStorage.getItem('schedulerReminderTypes');
    if (stored) {
        reminderTypes = JSON.parse(stored);
    }
}

function saveReminderTypes() {
    localStorage.setItem('schedulerReminderTypes', JSON.stringify(reminderTypes));
}

function loadTimesheetEntries() {
    timesheetEntries = JSON.parse(localStorage.getItem('schedulerTimesheet') || '[]');
}

function saveTimesheetEntries() {
    localStorage.setItem('schedulerTimesheet', JSON.stringify(timesheetEntries));
    markPendingSync();
    syncToCloud();
}

function loadActiveShift() {
    const stored = localStorage.getItem('schedulerActiveShift');
    if (stored) {
        activeShift = JSON.parse(stored);
    }
}

function saveActiveShift() {
    if (activeShift) {
        localStorage.setItem('schedulerActiveShift', JSON.stringify(activeShift));
    } else {
        localStorage.removeItem('schedulerActiveShift');
    }
}

// ============================================
// SYNC SYSTEM - Offline First Architecture
// ============================================

function loadSyncState() {
    pendingSync = localStorage.getItem('schedulerPendingSync') === 'true';
    lastSyncTime = localStorage.getItem('schedulerLastSync');
}

function markPendingSync() {
    pendingSync = true;
    localStorage.setItem('schedulerPendingSync', 'true');
    updateSyncStatusUI();
}

function clearPendingSync() {
    pendingSync = false;
    lastSyncTime = new Date().toISOString();
    localStorage.setItem('schedulerPendingSync', 'false');
    localStorage.setItem('schedulerLastSync', lastSyncTime);
    updateSyncStatusUI();
}

function setupConnectivityListeners() {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
}

function handleOnline() {
    isOnline = true;
    updateSyncStatusUI();
    showToast('Back online! Syncing...', 'success');
    
    // Sync pending changes
    if (pendingSync) {
        syncToCloud();
    }
}

function handleOffline() {
    isOnline = false;
    updateSyncStatusUI();
    showToast('You are offline. Changes saved locally.', 'warning');
}

function updateSyncStatusUI() {
    const statusEl = document.getElementById('syncStatus');
    if (!statusEl) return;
    
    if (isSyncing) {
        statusEl.innerHTML = `<span class="sync-circle syncing"></span>`;
        statusEl.className = 'sync-status syncing';
        statusEl.title = 'Syncing...';
    } else if (!isOnline) {
        statusEl.innerHTML = `<span class="sync-circle offline"></span>`;
        statusEl.className = 'sync-status offline';
        statusEl.title = 'Offline - Click to retry';
    } else if (pendingSync) {
        statusEl.innerHTML = `<span class="sync-circle pending"></span>`;
        statusEl.className = 'sync-status pending';
        statusEl.title = 'Pending - Click to sync now';
    } else {
        statusEl.innerHTML = `<span class="sync-circle synced"></span>`;
        statusEl.className = 'sync-status synced';
        statusEl.title = 'Synced';
    }
}

async function syncToCloud() {
    if (!currentUser?.userId) return;
    if (isSyncing) return; // Prevent multiple simultaneous syncs
    
    // Clear any existing timeout
    if (syncTimeout) clearTimeout(syncTimeout);
    
    // Debounce - wait 2 seconds before syncing
    syncTimeout = setTimeout(async () => {
        // Check if online
        if (!navigator.onLine) {
            isOnline = false;
            updateSyncStatusUI();
            return;
        }
        
        isSyncing = true;
        updateSyncStatusUI();
        
        try {
            const result = await apiCall('saveData', {
                userId: currentUser.userId,
                userData: { tasks, clients, reminders, timesheetEntries }
            });
            
            if (result.success) {
                // Sync successful - clear pending state
                clearPendingSync();
                console.log('✓ Synced to cloud');
            } else {
                // Sync failed - keep pending
                console.log('Sync failed:', result.message);
                markPendingSync();
            }
        } catch (error) {
            console.log('Sync error:', error);
            // Network error - mark as offline
            isOnline = false;
            markPendingSync();
        } finally {
            isSyncing = false;
            updateSyncStatusUI();
        }
    }, 2000);
}

// Manual sync trigger
async function forceSyncNow() {
    if (!navigator.onLine) {
        showToast('Cannot sync while offline', 'error');
        return;
    }
    
    if (isSyncing) {
        showToast('Sync already in progress...', 'info');
        return;
    }
    
    // Clear debounce and sync immediately
    if (syncTimeout) clearTimeout(syncTimeout);
    
    isSyncing = true;
    updateSyncStatusUI();
    showToast('Syncing...', 'info');
    
    try {
        const result = await apiCall('saveData', {
            userId: currentUser.userId,
            userData: { tasks, clients, reminders, timesheetEntries }
        });
        
        if (result.success) {
            clearPendingSync();
            showToast('Synced successfully!', 'success');
        } else {
            showToast('Sync failed: ' + result.message, 'error');
        }
    } catch (error) {
        showToast('Sync error. Please try again.', 'error');
        isOnline = false;
    } finally {
        isSyncing = false;
        updateSyncStatusUI();
    }
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
        timesheet: 'Timesheet',
        settings: 'Settings'
    };
    document.getElementById('pageTitle').textContent = titles[pageName] || pageName;
    
    // Refresh content
    if (pageName === 'dashboard') renderDashboard();
    if (pageName === 'schedule') renderCalendar();
    if (pageName === 'tasks') renderAllTasks();
    if (pageName === 'clients') renderClients();
    if (pageName === 'reminders') renderReminders();
    if (pageName === 'timesheet') renderTimesheet();
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
    const todayReminders = reminders.filter(r => r.date === today && !r.completed);
    const pendingReminders = reminders.filter(r => r.date >= today && !r.completed);
    const upcomingWeek = getUpcomingWeek();
    
    // Update stats
    document.getElementById('activeTasks').textContent = activeTasks.length;
    document.getElementById('todayTasks').textContent = todayTasks.length;
    document.getElementById('pendingReminders').textContent = pendingReminders.length;
    document.getElementById('totalClients').textContent = clients.length;
    
    // Render today's tasks
    renderTodayTasks(todayTasks);
    
    // Render today's reminders
    renderTodayReminders(todayReminders);
    
    // Render upcoming week
    renderUpcomingWeek(upcomingWeek);
}

// ============================================
// STATS MODAL FUNCTIONS
// ============================================

function openStatsModal(type) {
    const modal = document.getElementById('statsModal');
    const title = document.getElementById('statsModalTitle');
    const body = document.getElementById('statsModalBody');
    
    const today = formatDate(new Date());
    let content = '';
    let modalTitle = '';
    
    switch (type) {
        case 'activeTasks':
            modalTitle = '📋 Active Tasks';
            const activeTasks = tasks.filter(t => t.date >= today);
            content = renderStatsTaskList(activeTasks, 'No active tasks');
            break;
            
        case 'todayTasks':
            modalTitle = "📅 Today's Tasks";
            const todayTasks = tasks.filter(t => t.date === today);
            content = renderStatsTaskList(todayTasks, 'No tasks scheduled for today');
            break;
            
        case 'pendingReminders':
            modalTitle = '🔔 Pending Reminders';
            const pendingReminders = reminders.filter(r => r.date >= today && !r.completed);
            content = renderStatsReminderList(pendingReminders, 'No pending reminders');
            break;
            
        case 'totalClients':
            modalTitle = '👥 All Clients';
            content = renderStatsClientList(clients, 'No clients yet');
            break;
    }
    
    title.textContent = modalTitle;
    body.innerHTML = content;
    modal.classList.add('active');
}

function closeStatsModal() {
    document.getElementById('statsModal').classList.remove('active');
}

function renderStatsTaskList(taskList, emptyMessage) {
    if (taskList.length === 0) {
        return `
            <div class="empty-state">
                <span class="empty-icon">📋</span>
                <p>${emptyMessage}</p>
            </div>
        `;
    }
    
    // Sort by date and time
    const sorted = [...taskList].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startTime.localeCompare(b.startTime);
    });
    
    return `
        <div class="stats-list">
            ${sorted.map(task => {
                const client = clients.find(c => c.id === task.clientId);
                return `
                    <div class="stats-item" onclick="editTask('${task.id}'); closeStatsModal();">
                        <div class="stats-item-main">
                            <div class="stats-item-title">${escapeHtml(task.title)}</div>
                            <div class="stats-item-meta">
                                <span>📅 ${formatDateDisplay(task.date)}</span>
                                <span>🕐 ${formatTime(task.startTime)}</span>
                                ${client ? `<span>👤 ${escapeHtml(client.name)}</span>` : ''}
                            </div>
                        </div>
                        <span class="task-badge ${task.urgency}">${task.urgency}</span>
                    </div>
                `;
            }).join('')}
        </div>
        <div class="stats-summary">
            Total: ${taskList.length} task${taskList.length !== 1 ? 's' : ''}
        </div>
    `;
}

function renderStatsReminderList(reminderList, emptyMessage) {
    if (reminderList.length === 0) {
        return `
            <div class="empty-state">
                <span class="empty-icon">🔔</span>
                <p>${emptyMessage}</p>
            </div>
        `;
    }
    
    // Sort by date and time
    const sorted = [...reminderList].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startTime.localeCompare(b.startTime);
    });
    
    return `
        <div class="stats-list">
            ${sorted.map(reminder => {
                const client = clients.find(c => c.id === reminder.clientId);
                return `
                    <div class="stats-item" onclick="editReminder('${reminder.id}'); closeStatsModal();">
                        <div class="stats-item-main">
                            <div class="stats-item-title">${escapeHtml(reminder.title)}</div>
                            <div class="stats-item-meta">
                                <span>📅 ${formatDateDisplay(reminder.date)}</span>
                                <span>🕐 ${formatTime(reminder.startTime)}</span>
                                ${reminder.type ? `<span>📋 ${escapeHtml(reminder.type)}</span>` : ''}
                                ${client ? `<span>👤 ${escapeHtml(client.name)}</span>` : ''}
                            </div>
                        </div>
                        <span class="task-badge ${reminder.urgency}">${reminder.urgency}</span>
                    </div>
                `;
            }).join('')}
        </div>
        <div class="stats-summary">
            Total: ${reminderList.length} reminder${reminderList.length !== 1 ? 's' : ''}
        </div>
    `;
}

function renderStatsClientList(clientList, emptyMessage) {
    if (clientList.length === 0) {
        return `
            <div class="empty-state">
                <span class="empty-icon">👥</span>
                <p>${emptyMessage}</p>
            </div>
        `;
    }
    
    // Sort alphabetically
    const sorted = [...clientList].sort((a, b) => a.name.localeCompare(b.name));
    
    return `
        <div class="stats-list">
            ${sorted.map(client => {
                const clientTasks = tasks.filter(t => t.clientId === client.id);
                const clientReminders = reminders.filter(r => r.clientId === client.id);
                const emails = getClientEmails(client);
                return `
                    <div class="stats-item" onclick="editClient('${client.id}'); closeStatsModal();">
                        <div class="stats-item-main">
                            <div class="stats-item-title">${escapeHtml(client.name)}</div>
                            <div class="stats-item-meta">
                                ${emails.length > 0 ? `<span>📧 ${escapeHtml(emails[0])}</span>` : ''}
                                ${client.phone ? `<span>📱 ${escapeHtml(client.phone)}</span>` : ''}
                                ${client.timezone ? `<span>🕐 ${getClientLocalTime(client.timezone)}</span>` : ''}
                            </div>
                            <div class="stats-item-counts">
                                <span class="count-badge">${clientTasks.length} tasks</span>
                                <span class="count-badge">${clientReminders.length} reminders</span>
                                ${client.hourlyRate ? `<span class="count-badge rate">$${parseFloat(client.hourlyRate).toFixed(2)}/hr</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        <div class="stats-summary">
            Total: ${clientList.length} client${clientList.length !== 1 ? 's' : ''}
        </div>
    `;
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
    
    container.innerHTML = todayReminders.map(reminder => `
        <div class="task-item">
            <div class="task-item-header">
                <div class="task-item-title">${escapeHtml(reminder.title)}</div>
                <span class="task-badge ${reminder.urgency}">${reminder.urgency}</span>
            </div>
            <div class="task-item-meta">
                <span>🕐 ${formatTime(reminder.startTime)}</span>
                <span>⏰ ${reminder.reminderTime} min before</span>
                ${reminder.type ? `<span>📋 ${escapeHtml(reminder.type)}</span>` : ''}
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

// Reminder Filter Listeners
document.getElementById('reminderTypeFilter').addEventListener('change', (e) => {
    currentReminderTypeFilter = e.target.value;
    renderReminders();
});

document.getElementById('showCompletedReminders').addEventListener('change', () => {
    renderReminders();
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
        const dayReminders = reminders.filter(r => r.date === dateStr && !r.completed);
        
        let indicators = '';
        if (dayTasks.length > 0 || dayReminders.length > 0) {
            indicators = '<div class="calendar-indicators">';
            if (dayTasks.length > 0) {
                indicators += `<span class="calendar-indicator task-indicator">📅 ${dayTasks.length}</span>`;
            }
            if (dayReminders.length > 0) {
                indicators += `<span class="calendar-indicator reminder-indicator">📌 ${dayReminders.length}</span>`;
            }
            indicators += '</div>';
        }
        
        html += `<div class="calendar-day ${isToday ? 'today' : ''}" onclick="handleDateClick('${dateStr}')">
            <div class="calendar-day-number">${day}</div>
            ${indicators}
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

// Handle date click - show options based on existing items
function handleDateClick(dateStr) {
    const dayTasks = tasks.filter(t => t.date === dateStr);
    const dayReminders = reminders.filter(r => r.date === dateStr);
    
    if (dayTasks.length > 0 || dayReminders.length > 0) {
        // Has existing items - show what's on this date
        openDateDetailsModal(dateStr, dayTasks, dayReminders);
    } else {
        // Empty date - ask what to create
        openDateChoiceModal(dateStr);
    }
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
        const emails = getClientEmails(client);
        const emailDisplay = emails.length > 0 
            ? `<div class="client-info">📧 ${escapeHtml(emails[0])}${emails.length > 1 ? ` <span class="email-count">+${emails.length - 1} more</span>` : ''}</div>` 
            : '';
        const clientTime = client.timezone ? getClientLocalTime(client.timezone) : null;
        return `
            <div class="client-card">
                <div class="client-name">${escapeHtml(client.name)}</div>
                ${emailDisplay}
                ${client.phone ? `<div class="client-info">📱 ${escapeHtml(client.phone)}</div>` : ''}
                ${client.timezone ? `<div class="client-info">🕐 ${clientTime} <span class="timezone-label">(${getTimezoneShortLabel(client.timezone)})</span></div>` : ''}
                ${client.hourlyRate ? `<div class="client-info">💰 $${parseFloat(client.hourlyRate).toFixed(2)}/hr</div>` : ''}
                <div class="client-task-count">${clientTasks.length} task${clientTasks.length !== 1 ? 's' : ''}</div>
                <div class="client-actions">
                    <button class="btn btn-primary btn-small" onclick="openContactModal('${client.id}')">Contact</button>
                    <button class="btn btn-secondary btn-small" onclick="editClient('${client.id}')">Edit</button>
                    <button class="btn btn-danger btn-small" onclick="deleteClient('${client.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

// Get client's local time based on timezone
function getClientLocalTime(timezone) {
    try {
        return new Date().toLocaleTimeString('en-US', { 
            timeZone: timezone, 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
    } catch (e) {
        return '--:--';
    }
}

function getTimezoneShortLabel(timezone) {
    const tz = TIMEZONES.find(t => t.value === timezone);
    if (tz) {
        const match = tz.label.match(/\((GMT[^)]+)\)/);
        return match ? match[1] : timezone;
    }
    return timezone;
}

// Helper to get client emails as array (handles legacy single email format)
function getClientEmails(client) {
    if (Array.isArray(client.emails)) {
        return client.emails.filter(e => e && e.trim());
    }
    // Legacy support: single email field
    if (client.email && client.email.trim()) {
        return [client.email.trim()];
    }
    return [];
}

function updateClientSelectors() {
    const options = [...clients]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
        .join('');
    
    document.getElementById('taskClient').innerHTML = '<option value="">Select client</option>' + options;
    document.getElementById('taskClientFilter').innerHTML = '<option value="all">All Clients</option>' + options;
    document.getElementById('reminderClient').innerHTML = '<option value="">Select client</option>' + options;
    
    // Update timesheet client selector if exists
    const timesheetClient = document.getElementById('timesheetClient');
    if (timesheetClient) {
        timesheetClient.innerHTML = '<option value="">Choose a client...</option>' + options;
    }
    
    // Update entries filter if exists
    const entriesFilter = document.getElementById('entriesClientFilter');
    if (entriesFilter) {
        entriesFilter.innerHTML = '<option value="all">All Clients</option>' + options;
    }
}

function populateTimezoneSelect() {
    const select = document.getElementById('clientTimezone');
    if (select) {
        select.innerHTML = '<option value="">Select timezone</option>' + 
            TIMEZONES.map(tz => `<option value="${tz.value}">${tz.label}</option>`).join('');
    }
}

function openAddClientModal() {
    editingClientId = null;
    document.getElementById('clientModalTitle').textContent = 'Add Client';
    document.getElementById('clientForm').reset();
    resetEmailFields();
    document.getElementById('clientModal').classList.add('active');
}

function editClient(id) {
    const client = clients.find(c => c.id === id);
    if (!client) return;
    
    editingClientId = id;
    document.getElementById('clientModalTitle').textContent = 'Edit Client';
    document.getElementById('clientName').value = client.name;
    document.getElementById('clientPhone').value = client.phone || '';
    document.getElementById('clientTimezone').value = client.timezone || '';
    document.getElementById('clientHourlyRate').value = client.hourlyRate || '';
    document.getElementById('clientNotes').value = client.notes || '';
    
    // Populate emails
    const emails = getClientEmails(client);
    populateEmailFields(emails);
    
    document.getElementById('clientModal').classList.add('active');
}

function closeClientModal() {
    document.getElementById('clientModal').classList.remove('active');
    editingClientId = null;
}

function saveClient(e) {
    e.preventDefault();
    
    // Collect all emails from the form
    const emailInputs = document.querySelectorAll('#emailsContainer .client-email-input');
    const emails = Array.from(emailInputs)
        .map(input => input.value.trim())
        .filter(email => email);
    
    const existingClient = editingClientId ? clients.find(c => c.id === editingClientId) : null;
    
    const data = {
        id: editingClientId || generateId(),
        name: document.getElementById('clientName').value,
        emails: emails,
        email: emails[0] || '', // Keep legacy field for backward compatibility
        phone: document.getElementById('clientPhone').value,
        timezone: document.getElementById('clientTimezone').value,
        hourlyRate: document.getElementById('clientHourlyRate').value || 0,
        notes: document.getElementById('clientNotes').value,
        createdAt: existingClient?.createdAt || new Date().toISOString()
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
    // Warn if there are pending changes
    if (pendingSync) {
        if (!confirm('You have unsynced changes that may be lost. Are you sure you want to logout?')) return;
    } else {
        if (!confirm('Are you sure you want to logout?')) return;
    }
    
    // Warn if shift is active
    if (activeShift) {
        if (!confirm('You have an active shift! It will be lost. Continue?')) return;
    }
    
    ['vaSchedulerUser', 'schedulerTasks', 'schedulerClients', 'schedulerReminders', 'schedulerTimesheet', 'schedulerActiveShift', 'schedulerReminderTypes', 'schedulerProfile', 'schedulerTheme', 'schedulerHasVisited', 'verified', 'schedulerPendingSync', 'schedulerLastSync'].forEach(key => {
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

// Using reliable sound URLs from free sound libraries
const soundUrls = {
    default: 'https://cdn.freesound.org/previews/536/536420_4921277-lq.mp3',
    chime: 'https://cdn.freesound.org/previews/411/411089_5121236-lq.mp3',
    bell: 'https://cdn.pixabay.com/audio/2021/08/04/audio_0625c1539c.mp3',
    alert: 'https://cdn.freesound.org/previews/352/352661_5121236-lq.mp3',
    ding: 'https://cdn.freesound.org/previews/256/256113_3263906-lq.mp3',
    notification: 'https://cdn.freesound.org/previews/320/320655_5260872-lq.mp3',
    gentle: 'https://cdn.freesound.org/previews/221/221359_2130724-lq.mp3',
    alarm: 'https://cdn.freesound.org/previews/250/250629_4486188-lq.mp3'
};

// Audio element for previews (reusable)
let previewAudio = null;

function loadAlarmSettings() {
    const stored = localStorage.getItem('schedulerAlarmSettings');
    if (stored) {
        alarmSettings = JSON.parse(stored);
    }
    
    const alarmSoundSelect = document.getElementById('alarmSound');
    if (alarmSoundSelect) {
        alarmSoundSelect.value = alarmSettings.sound || 'default';
        
        if (alarmSettings.sound === 'custom') {
            document.getElementById('customSoundGroup').style.display = 'block';
            document.getElementById('customSoundUrl').value = alarmSettings.customUrl || '';
        }
        
        // Add change listener - don't auto-play on change (mobile restriction)
        alarmSoundSelect.addEventListener('change', function() {
            const selectedSound = this.value;
            
            if (selectedSound === 'custom') {
                document.getElementById('customSoundGroup').style.display = 'block';
            } else {
                document.getElementById('customSoundGroup').style.display = 'none';
            }
            
            // Stop any currently playing preview
            stopAlarmPreview();
        });
    }
}

function stopAlarmPreview() {
    if (previewAudio) {
        previewAudio.pause();
        previewAudio.currentTime = 0;
    }
}

function playAlarmPreview(soundType) {
    const soundUrl = soundType === 'custom' 
        ? document.getElementById('customSoundUrl').value 
        : soundUrls[soundType];
    
    if (!soundUrl) {
        showToast('Please enter a custom sound URL first', 'warning');
        return;
    }
    
    // Stop any existing preview
    stopAlarmPreview();
    
    try {
        // Create new audio element
        previewAudio = new Audio();
        previewAudio.volume = 0.7;
        previewAudio.src = soundUrl;
        
        // Add event listeners
        previewAudio.onloadeddata = function() {
            console.log('Audio loaded successfully');
        };
        
        previewAudio.onerror = function(e) {
            console.log('Audio error:', e);
            showToast('Failed to load sound. Try a different one.', 'error');
        };
        
        previewAudio.onended = function() {
            showToast('Sound preview complete', 'success');
        };
        
        // Play the audio
        const playPromise = previewAudio.play();
        
        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    showToast('🔊 Playing sound...', 'info');
                })
                .catch(e => {
                    console.log('Audio play failed:', e);
                    // Try alternative approach for mobile
                    showToast('Tap the Test Sound button again', 'warning');
                });
        }
    } catch (e) {
        console.log('Audio error:', e);
        showToast('Failed to play sound', 'error');
    }
}

function testAlarmSound() {
    const soundType = document.getElementById('alarmSound').value;
    playAlarmPreview(soundType);
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
    const showCompleted = document.getElementById('showCompletedReminders')?.checked || false;
    
    let filteredReminders = [...reminders];
    
    // Filter by type
    if (currentReminderTypeFilter !== 'all') {
        filteredReminders = filteredReminders.filter(r => r.type === currentReminderTypeFilter);
    }
    
    // Filter completed
    if (!showCompleted) {
        const today = formatDate(new Date());
        filteredReminders = filteredReminders.filter(r => r.date >= today && !r.completed);
    }
    
    // Sort by date
    filteredReminders.sort((a, b) => new Date(a.date + 'T' + a.startTime) - new Date(b.date + 'T' + b.startTime));
    
    if (filteredReminders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">🔔</span>
                <p>No reminders yet. Create one to stay organized! 🗂️</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredReminders.map(reminder => {
        const client = clients.find(c => c.id === reminder.clientId);
        return `
            <div class="task-item ${reminder.completed ? 'completed' : ''}">
                <div class="task-item-header">
                    <div class="task-item-title">${escapeHtml(reminder.title)}</div>
                    <span class="task-badge ${reminder.urgency}">${reminder.urgency}</span>
                </div>
                <div class="task-item-meta">
                    <span>📅 ${formatDateDisplay(reminder.date)}</span>
                    <span>🕐 ${formatTime(reminder.startTime)}</span>
                    <span>⏰ ${reminder.reminderTime} min before</span>
                    ${reminder.type ? `<span>📋 ${escapeHtml(reminder.type)}</span>` : ''}
                    ${client ? `<span>👤 ${escapeHtml(client.name)}</span>` : ''}
                </div>
                <div class="task-item-actions">
                    <button class="btn btn-secondary btn-small" onclick="editReminder('${reminder.id}')">Edit</button>
                    <button class="btn btn-danger btn-small" onclick="deleteReminder('${reminder.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function openAddReminderModal() {
    editingReminderId = null;
    document.getElementById('reminderModalTitle').textContent = 'Add Reminder';
    document.getElementById('reminderForm').reset();
    document.getElementById('reminderDate').value = formatDate(new Date());
    document.getElementById('reminderDate').min = formatDate(new Date());
    updateReminderClientSelectors();
    updateReminderTypeSelector();
    document.getElementById('reminderModal').classList.add('active');
}

function editReminder(id) {
    const reminder = reminders.find(r => r.id === id);
    if (!reminder) return;
    
    editingReminderId = id;
    document.getElementById('reminderModalTitle').textContent = 'Edit Reminder';
    document.getElementById('reminderClient').value = reminder.clientId || '';
    document.getElementById('reminderType').value = reminder.type || '';
    document.getElementById('reminderTitle').value = reminder.title;
    document.getElementById('reminderDescription').value = reminder.description || '';
    document.getElementById('reminderDate').value = reminder.date;
    document.getElementById('reminderStartTime').value = reminder.startTime;
    document.getElementById('reminderEndTime').value = reminder.endTime || '';
    document.getElementById('reminderUrgency').value = reminder.urgency;
    document.getElementById('reminderReminder').value = reminder.reminderTime;
    
    updateReminderClientSelectors();
    updateReminderTypeSelector();
    document.getElementById('reminderModal').classList.add('active');
}

function closeReminderModal() {
    document.getElementById('reminderModal').classList.remove('active');
    editingReminderId = null;
}

function saveReminder(e) {
    e.preventDefault();
    
    const data = {
        id: editingReminderId || generateId(),
        clientId: document.getElementById('reminderClient').value,
        type: document.getElementById('reminderType').value,
        title: document.getElementById('reminderTitle').value,
        description: document.getElementById('reminderDescription').value,
        date: document.getElementById('reminderDate').value,
        startTime: document.getElementById('reminderStartTime').value,
        endTime: document.getElementById('reminderEndTime').value,
        urgency: document.getElementById('reminderUrgency').value,
        reminderTime: parseInt(document.getElementById('reminderReminder').value),
        alerted: false,
        completed: false,
        createdAt: editingReminderId 
            ? reminders.find(r => r.id === editingReminderId)?.createdAt 
            : new Date().toISOString()
    };
    
    if (editingReminderId) {
        const index = reminders.findIndex(r => r.id === editingReminderId);
        if (index !== -1) reminders[index] = data;
    } else {
        reminders.push(data);
    }
    
    saveReminders();
    closeReminderModal();
    renderReminders();
    renderDashboard();
    showToast('Reminder saved successfully!', 'success');
}

function deleteReminder(id) {
    const reminder = reminders.find(r => r.id === id);
    if (!confirm(`Delete reminder "${reminder.title}"?`)) return;
    
    reminders = reminders.filter(r => r.id !== id);
    saveReminders();
    renderReminders();
    renderDashboard();
    showToast('Reminder deleted', 'success');
}

function updateReminderClientSelectors() {
    const options = [...clients]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
        .join('');
    
    document.getElementById('reminderClient').innerHTML = '<option value="">Select client</option>' + options;
}

function updateReminderTypeSelector() {
    const typeSelect = document.getElementById('reminderType');
    const filterSelect = document.getElementById('reminderTypeFilter');
    
    const options = reminderTypes
        .map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`)
        .join('');
    
    if (typeSelect) {
        const currentValue = typeSelect.value;
        typeSelect.innerHTML = '<option value="">Select type</option>' + options;
        if (currentValue && reminderTypes.includes(currentValue)) {
            typeSelect.value = currentValue;
        }
    }
    
    if (filterSelect) {
        const currentFilter = filterSelect.value;
        filterSelect.innerHTML = '<option value="all">All Types</option>' + options;
        if (currentFilter) {
            filterSelect.value = currentFilter;
        }
    }
}

function openAddReminderTypeModal() {
    document.getElementById('newReminderType').value = '';
    document.getElementById('reminderTypeModal').classList.add('active');
}

function closeReminderTypeModal() {
    document.getElementById('reminderTypeModal').classList.remove('active');
}

function saveReminderType(e) {
    e.preventDefault();
    
    const newType = document.getElementById('newReminderType').value.trim();
    
    if (!newType) {
        showToast('Please enter a type name', 'error');
        return;
    }
    
    if (reminderTypes.includes(newType)) {
        showToast('This type already exists', 'error');
        return;
    }
    
    reminderTypes.push(newType);
    saveReminderTypes();
    updateReminderTypeSelector();
    
    // Select the newly added type
    document.getElementById('reminderType').value = newType;
    
    closeReminderTypeModal();
    showToast('Reminder type added!', 'success');
}

function checkReminders() {
    const now = new Date();
    const nowTime = now.getTime();
    
    // Check tasks with reminders
    tasks.forEach(task => {
        if (task.reminder > 0 && !task.alerted) {
            const taskDateTime = new Date(`${task.date}T${task.startTime}`);
            const alertTime = taskDateTime.getTime() - (task.reminder * 60000);
            
            // Check if we're within the alert window (alert time has passed but task time hasn't)
            if (nowTime >= alertTime && nowTime <= taskDateTime.getTime()) {
                playAlarmSound();
                
                if (Notification.permission === 'granted') {
                    new Notification('Task Reminder', { 
                        body: `${task.title} - in ${task.reminder} minutes`,
                        icon: '📋',
                        tag: `task-${task.id}`
                    });
                }
                
                showToast(`⏰ Task: ${task.title} - in ${task.reminder} min`, 'warning');
                
                task.alerted = true;
                saveTasks();
            }
        }
    });
    
    // Check dedicated reminders
    reminders.forEach(reminder => {
        if (reminder.reminderTime > 0 && !reminder.alerted && !reminder.completed) {
            const reminderDateTime = new Date(`${reminder.date}T${reminder.startTime}`);
            const alertTime = reminderDateTime.getTime() - (reminder.reminderTime * 60000);
            
            // Check if we're within the alert window
            if (nowTime >= alertTime && nowTime <= reminderDateTime.getTime()) {
                playAlarmSound();
                
                if (Notification.permission === 'granted') {
                    const typeLabel = reminder.type ? `[${reminder.type}] ` : '';
                    new Notification('Reminder', { 
                        body: `${typeLabel}${reminder.title} - in ${reminder.reminderTime} minutes`,
                        icon: '🔔',
                        tag: `reminder-${reminder.id}`
                    });
                }
                
                showToast(`🔔 Reminder: ${reminder.title} - in ${reminder.reminderTime} min`, 'warning');
                
                reminder.alerted = true;
                saveReminders();
            }
        }
    });
}

function playAlarmSound() {
    try {
        const soundUrl = alarmSettings.sound === 'custom' 
            ? alarmSettings.customUrl 
            : soundUrls[alarmSettings.sound] || soundUrls.default;
        
        const audio = new Audio(soundUrl);
        audio.volume = 0.8;
        audio.play().catch(e => console.log('Audio play failed:', e));
    } catch (e) {
        console.log('Alarm sound error:', e);
    }
}

function toggleMobileMenu() {
    document.querySelector('.sidebar').classList.toggle('active');
    document.querySelector('.mobile-menu-toggle').classList.toggle('active');
}

function openAddTaskOnDate(dateStr) {
    openAddTaskModal();
    document.getElementById('taskDate').value = dateStr;
}

function openAddReminderOnDate(dateStr) {
    openAddReminderModal();
    document.getElementById('reminderDate').value = dateStr;
}

// Date Choice Modal - when clicking empty date
function openDateChoiceModal(dateStr) {
    const modalBody = document.getElementById('dateModalBody');
    modalBody.innerHTML = `
        <div class="date-choice-content">
            <p>What would you like to create for <strong>${formatDateDisplay(dateStr)}</strong>?</p>
            <div class="date-choice-buttons">
                <button class="btn btn-primary date-choice-btn" onclick="closeDateModal(); openAddTaskOnDate('${dateStr}')">
                    <span class="date-choice-icon">📅</span>
                    <span>New Task</span>
                </button>
                <button class="btn btn-secondary date-choice-btn" onclick="closeDateModal(); openAddReminderOnDate('${dateStr}')">
                    <span class="date-choice-icon">📌</span>
                    <span>New Reminder</span>
                </button>
            </div>
        </div>
    `;
    document.getElementById('dateModalTitle').textContent = 'Create New';
    document.getElementById('dateModal').classList.add('active');
}

// Date Details Modal - when clicking date with existing items
function openDateDetailsModal(dateStr, dayTasks, dayReminders) {
    const modalBody = document.getElementById('dateModalBody');
    
    let content = `<div class="date-details-content">`;
    
    // Tasks section
    if (dayTasks.length > 0) {
        content += `<div class="date-section">
            <h4>📅 Tasks (${dayTasks.length})</h4>
            <div class="date-items-list">
                ${dayTasks.map(task => {
                    const client = clients.find(c => c.id === task.clientId);
                    return `
                        <div class="date-item">
                            <div class="date-item-header">
                                <span class="date-item-title">${escapeHtml(task.title)}</span>
                                <span class="task-badge ${task.urgency}">${task.urgency}</span>
                            </div>
                            <div class="date-item-meta">
                                <span>🕐 ${formatTime(task.startTime)}</span>
                                ${client ? `<span>👤 ${escapeHtml(client.name)}</span>` : ''}
                            </div>
                            <div class="date-item-actions">
                                <button class="btn btn-secondary btn-small" onclick="closeDateModal(); editTask('${task.id}')">Edit</button>
                                <button class="btn btn-danger btn-small" onclick="deleteTaskFromModal('${task.id}', '${dateStr}')">Delete</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>`;
    }
    
    // Reminders section
    if (dayReminders.length > 0) {
        content += `<div class="date-section">
            <h4>📌 Reminders (${dayReminders.length})</h4>
            <div class="date-items-list">
                ${dayReminders.map(reminder => {
                    const client = clients.find(c => c.id === reminder.clientId);
                    return `
                        <div class="date-item ${reminder.completed ? 'completed' : ''}">
                            <div class="date-item-header">
                                <span class="date-item-title">${escapeHtml(reminder.title)}</span>
                                <span class="task-badge ${reminder.urgency}">${reminder.urgency}</span>
                            </div>
                            <div class="date-item-meta">
                                <span>🕐 ${formatTime(reminder.startTime)}</span>
                                ${reminder.type ? `<span>📋 ${escapeHtml(reminder.type)}</span>` : ''}
                                ${client ? `<span>👤 ${escapeHtml(client.name)}</span>` : ''}
                            </div>
                            <div class="date-item-actions">
                                <button class="btn btn-success btn-small" onclick="toggleReminderComplete('${reminder.id}', '${dateStr}')">${reminder.completed ? 'Undo' : 'Done'}</button>
                                <button class="btn btn-secondary btn-small" onclick="closeDateModal(); editReminder('${reminder.id}')">Edit</button>
                                <button class="btn btn-danger btn-small" onclick="deleteReminderFromModal('${reminder.id}', '${dateStr}')">Delete</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>`;
    }
    
    // Add new buttons
    content += `
        <div class="date-add-buttons">
            <button class="btn btn-primary btn-small" onclick="closeDateModal(); openAddTaskOnDate('${dateStr}')">+ Add Task</button>
            <button class="btn btn-secondary btn-small" onclick="closeDateModal(); openAddReminderOnDate('${dateStr}')">+ Add Reminder</button>
        </div>
    </div>`;
    
    modalBody.innerHTML = content;
    document.getElementById('dateModalTitle').textContent = formatDateDisplay(dateStr);
    document.getElementById('dateModal').classList.add('active');
}

function closeDateModal() {
    document.getElementById('dateModal').classList.remove('active');
}

function deleteTaskFromModal(taskId, dateStr) {
    const task = tasks.find(t => t.id === taskId);
    if (!confirm(`Delete task "${task.title}"?`)) return;
    
    tasks = tasks.filter(t => t.id !== taskId);
    saveTasks();
    renderCalendar();
    renderDashboard();
    renderAllTasks();
    
    // Refresh the modal
    const dayTasks = tasks.filter(t => t.date === dateStr);
    const dayReminders = reminders.filter(r => r.date === dateStr);
    if (dayTasks.length > 0 || dayReminders.length > 0) {
        openDateDetailsModal(dateStr, dayTasks, dayReminders);
    } else {
        closeDateModal();
    }
    showToast('Task deleted', 'success');
}

function deleteReminderFromModal(reminderId, dateStr) {
    const reminder = reminders.find(r => r.id === reminderId);
    if (!confirm(`Delete reminder "${reminder.title}"?`)) return;
    
    reminders = reminders.filter(r => r.id !== reminderId);
    saveReminders();
    renderCalendar();
    renderDashboard();
    renderReminders();
    
    // Refresh the modal
    const dayTasks = tasks.filter(t => t.date === dateStr);
    const dayReminders = reminders.filter(r => r.date === dateStr);
    if (dayTasks.length > 0 || dayReminders.length > 0) {
        openDateDetailsModal(dateStr, dayTasks, dayReminders);
    } else {
        closeDateModal();
    }
    showToast('Reminder deleted', 'success');
}

function toggleReminderComplete(reminderId, dateStr) {
    const reminder = reminders.find(r => r.id === reminderId);
    if (reminder) {
        reminder.completed = !reminder.completed;
        saveReminders();
        renderCalendar();
        renderDashboard();
        renderReminders();
        
        // Refresh the modal
        const dayTasks = tasks.filter(t => t.date === dateStr);
        const dayReminders = reminders.filter(r => r.date === dateStr);
        openDateDetailsModal(dateStr, dayTasks, dayReminders);
        
        showToast(reminder.completed ? 'Reminder completed!' : 'Reminder unmarked', 'success');
    }
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
    if (e.target.id === 'reminderTypeModal') closeReminderTypeModal();
    if (e.target.id === 'dateModal') closeDateModal();
    if (e.target.id === 'themeModal') closeThemeModal();
    if (e.target.id === 'alarmModal') closeAlarmModal();
    if (e.target.id === 'profileModal') closeProfileModal();
    if (e.target.id === 'usernameModal') closeUsernameModal();
    if (e.target.id === 'passwordModal') closePasswordModal();
    if (e.target.id === 'exportModal') closeExportModal();
    if (e.target.id === 'contactModal') closeContactModal();
});

// Email Field Management Functions
function addEmailField() {
    const container = document.getElementById('emailsContainer');
    const newRow = document.createElement('div');
    newRow.className = 'email-input-row';
    newRow.innerHTML = `
        <input type="email" class="client-email-input" placeholder="Enter email">
        <button type="button" class="btn-icon btn-remove-email" onclick="removeEmailField(this)" title="Remove email">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;
    container.appendChild(newRow);
    updateRemoveButtons();
}

function removeEmailField(button) {
    const row = button.closest('.email-input-row');
    row.remove();
    updateRemoveButtons();
}

function updateRemoveButtons() {
    const rows = document.querySelectorAll('#emailsContainer .email-input-row');
    rows.forEach((row, index) => {
        const removeBtn = row.querySelector('.btn-remove-email');
        // Show remove button only if there's more than one row
        removeBtn.style.display = rows.length > 1 ? 'flex' : 'none';
    });
}

function resetEmailFields() {
    const container = document.getElementById('emailsContainer');
    container.innerHTML = `
        <div class="email-input-row">
            <input type="email" class="client-email-input" placeholder="Enter email">
            <button type="button" class="btn-icon btn-remove-email" onclick="removeEmailField(this)" title="Remove email" style="display: none;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `;
}

function populateEmailFields(emails) {
    const container = document.getElementById('emailsContainer');
    if (emails.length === 0) {
        resetEmailFields();
        return;
    }
    
    container.innerHTML = emails.map((email, index) => `
        <div class="email-input-row">
            <input type="email" class="client-email-input" placeholder="Enter email" value="${escapeHtml(email)}">
            <button type="button" class="btn-icon btn-remove-email" onclick="removeEmailField(this)" title="Remove email" style="display: ${emails.length > 1 ? 'flex' : 'none'};">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `).join('');
}

// Contact Modal Functions
let contactingClientId = null;

function openContactModal(clientId) {
    const client = clients.find(c => c.id === clientId);
    if (!client) return;
    
    contactingClientId = clientId;
    const emails = getClientEmails(client);
    const modalBody = document.getElementById('contactModalBody');
    
    if (emails.length === 0) {
        // No emails - show prompt to add
        modalBody.innerHTML = `
            <div class="contact-no-email">
                <div class="contact-no-email-icon">📧</div>
                <p>No email address for <strong>${escapeHtml(client.name)}</strong></p>
                <p class="contact-hint">Please add a client email to contact them.</p>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeContactModal()">Cancel</button>
                    <button type="button" class="btn btn-primary" onclick="closeContactModal(); editClient('${client.id}')">Add Email</button>
                </div>
            </div>
        `;
    } else if (emails.length === 1) {
        // Single email - open directly
        closeContactModal();
        openEmailClient(emails[0], client.name);
        return;
    } else {
        // Multiple emails - show selection
        modalBody.innerHTML = `
            <div class="contact-email-selection">
                <p>Select an email to contact <strong>${escapeHtml(client.name)}</strong>:</p>
                <div class="email-options">
                    ${emails.map(email => `
                        <button class="email-option" onclick="selectEmailAndContact('${escapeHtml(email)}', '${escapeHtml(client.name)}')">
                            <span class="email-option-icon">📧</span>
                            <span class="email-option-text">${escapeHtml(email)}</span>
                        </button>
                    `).join('')}
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" onclick="closeContactModal()">Cancel</button>
                </div>
            </div>
        `;
    }
    
    document.getElementById('contactModal').classList.add('active');
}

function closeContactModal() {
    document.getElementById('contactModal').classList.remove('active');
    contactingClientId = null;
}

function selectEmailAndContact(email, clientName) {
    closeContactModal();
    openEmailClient(email, clientName);
}

function openEmailClient(email, clientName) {
    // Create Gmail compose link - just the email, no subject
    const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`;
    window.open(gmailLink, '_blank');
    showToast(`Opening Gmail to ${email}`, 'success');
}

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

// ============================================
// TIMESHEET SYSTEM
// ============================================

function renderTimesheet() {
    updateClientSelectors();
    updateTimesheetSummary();
    renderTimesheetEntries();
    
    // Restore selected client if there's an active shift
    if (activeShift) {
        document.getElementById('timesheetClient').value = activeShift.clientId;
        updateClientInfoDisplay(activeShift.clientId);
    }
}

function updateClientInfoDisplay(clientId) {
    const infoDisplay = document.getElementById('clientInfoDisplay');
    const client = clients.find(c => c.id === clientId);
    
    if (!client) {
        infoDisplay.style.display = 'none';
        return;
    }
    
    infoDisplay.style.display = 'block';
    
    // Update rate display
    const rate = parseFloat(client.hourlyRate) || 0;
    document.getElementById('clientRateDisplay').textContent = `$${rate.toFixed(2)}/hr`;
    
    // Update client time
    if (client.timezone) {
        updateClientTime(client.timezone);
        // Start interval to update client time every minute
        if (clientTimeInterval) clearInterval(clientTimeInterval);
        clientTimeInterval = setInterval(() => updateClientTime(client.timezone), 60000);
    } else {
        document.getElementById('clientLocalTime').textContent = 'No timezone set';
    }
}

function updateClientTime(timezone) {
    document.getElementById('clientLocalTime').textContent = getClientLocalTime(timezone);
}

// Handle client selection change
document.addEventListener('change', (e) => {
    if (e.target.id === 'timesheetClient') {
        const clientId = e.target.value;
        if (clientId) {
            updateClientInfoDisplay(clientId);
        } else {
            document.getElementById('clientInfoDisplay').style.display = 'none';
        }
    }
});

function startShift() {
    const clientId = document.getElementById('timesheetClient').value;
    
    if (!clientId) {
        showToast('Please select a client first', 'error');
        return;
    }
    
    const client = clients.find(c => c.id === clientId);
    
    activeShift = {
        id: generateId(),
        clientId: clientId,
        clientName: client.name,
        hourlyRate: parseFloat(client.hourlyRate) || 0,
        startTime: new Date().toISOString(),
        date: formatDate(new Date())
    };
    
    saveActiveShift();
    
    // Update UI
    document.getElementById('startShiftBtn').style.display = 'none';
    document.getElementById('endShiftBtn').style.display = 'inline-flex';
    document.getElementById('timesheetClient').disabled = true;
    
    // Start timer
    startShiftTimer();
    
    showToast(`Shift started for ${client.name}`, 'success');
}

function resumeActiveShift() {
    if (!activeShift) return;
    
    // Update UI
    document.getElementById('startShiftBtn').style.display = 'none';
    document.getElementById('endShiftBtn').style.display = 'inline-flex';
    
    const clientSelect = document.getElementById('timesheetClient');
    if (clientSelect) {
        clientSelect.value = activeShift.clientId;
        clientSelect.disabled = true;
        updateClientInfoDisplay(activeShift.clientId);
    }
    
    // Resume timer
    startShiftTimer();
}

function startShiftTimer() {
    if (shiftTimerInterval) clearInterval(shiftTimerInterval);
    
    const updateTimer = () => {
        if (!activeShift) return;
        
        const start = new Date(activeShift.startTime);
        const now = new Date();
        const diff = now - start;
        
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        
        document.getElementById('timerDisplay').textContent = 
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        // Calculate earnings
        const hoursWorked = diff / 3600000;
        const earnings = hoursWorked * activeShift.hourlyRate;
        document.getElementById('timerEarnings').textContent = `$${earnings.toFixed(2)}`;
    };
    
    updateTimer();
    shiftTimerInterval = setInterval(updateTimer, 1000);
}

function endShift() {
    if (!activeShift) return;
    
    const endTime = new Date();
    const startTime = new Date(activeShift.startTime);
    const duration = endTime - startTime;
    const hoursWorked = duration / 3600000;
    const earnings = hoursWorked * activeShift.hourlyRate;
    
    // Create timesheet entry
    const entry = {
        id: activeShift.id,
        clientId: activeShift.clientId,
        clientName: activeShift.clientName,
        date: activeShift.date,
        startTime: activeShift.startTime,
        endTime: endTime.toISOString(),
        duration: duration,
        hoursWorked: hoursWorked,
        hourlyRate: activeShift.hourlyRate,
        earnings: earnings
    };
    
    timesheetEntries.push(entry);
    saveTimesheetEntries();
    
    // Clear active shift
    if (shiftTimerInterval) clearInterval(shiftTimerInterval);
    activeShift = null;
    saveActiveShift();
    
    // Reset UI
    document.getElementById('startShiftBtn').style.display = 'inline-flex';
    document.getElementById('endShiftBtn').style.display = 'none';
    document.getElementById('timesheetClient').disabled = false;
    document.getElementById('timerDisplay').textContent = '00:00:00';
    document.getElementById('timerEarnings').textContent = '$0.00';
    
    // Refresh displays
    updateTimesheetSummary();
    renderTimesheetEntries();
    
    showToast(`Shift ended! Earned $${earnings.toFixed(2)}`, 'success');
}

function updateTimesheetSummary() {
    const period = document.getElementById('summaryPeriod')?.value || 'today';
    const filteredEntries = filterEntriesByPeriod(timesheetEntries, period);
    
    let totalHours = 0;
    let totalEarnings = 0;
    
    filteredEntries.forEach(entry => {
        totalHours += entry.hoursWorked || 0;
        totalEarnings += entry.earnings || 0;
    });
    
    const hours = Math.floor(totalHours);
    const minutes = Math.round((totalHours - hours) * 60);
    
    document.getElementById('summaryHours').textContent = `${hours}h ${minutes}m`;
    document.getElementById('summaryEarnings').textContent = `$${totalEarnings.toFixed(2)}`;
    document.getElementById('summaryShifts').textContent = filteredEntries.length;
}

function filterEntriesByPeriod(entries, period) {
    const now = new Date();
    const today = formatDate(now);
    
    switch (period) {
        case 'today':
            return entries.filter(e => e.date === today);
        case 'week':
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            return entries.filter(e => new Date(e.date) >= weekAgo);
        case 'month':
            const monthAgo = new Date(now);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            return entries.filter(e => new Date(e.date) >= monthAgo);
        case 'all':
        default:
            return entries;
    }
}

function renderTimesheetEntries() {
    const container = document.getElementById('timesheetEntries');
    if (!container) return;
    
    const clientFilter = document.getElementById('entriesClientFilter')?.value || 'all';
    
    let filteredEntries = [...timesheetEntries];
    
    if (clientFilter !== 'all') {
        filteredEntries = filteredEntries.filter(e => e.clientId === clientFilter);
    }
    
    // Sort by date descending
    filteredEntries.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
    if (filteredEntries.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">⏰</span>
                <p>No time entries yet. Start tracking your work!</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredEntries.map(entry => {
        const startTime = new Date(entry.startTime);
        const endTime = new Date(entry.endTime);
        const hours = Math.floor(entry.hoursWorked);
        const minutes = Math.round((entry.hoursWorked - hours) * 60);
        
        return `
            <div class="timesheet-entry">
                <div class="entry-header">
                    <div class="entry-client">${escapeHtml(entry.clientName)}</div>
                    <div class="entry-date">${formatDateDisplay(entry.date)}</div>
                </div>
                <div class="entry-details">
                    <div class="entry-time">
                        <span>🕐 ${formatTimeFromDate(startTime)} - ${formatTimeFromDate(endTime)}</span>
                    </div>
                    <div class="entry-duration">${hours}h ${minutes}m</div>
                    <div class="entry-rate">$${entry.hourlyRate.toFixed(2)}/hr</div>
                    <div class="entry-earnings">$${entry.earnings.toFixed(2)}</div>
                </div>
                <div class="entry-actions">
                    <button class="btn btn-secondary btn-small" onclick="editTimesheetEntry('${entry.id}')">Edit</button>
                    <button class="btn btn-danger btn-small" onclick="deleteTimesheetEntry('${entry.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function formatTimeFromDate(date) {
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
}

function deleteTimesheetEntry(id) {
    const entry = timesheetEntries.find(e => e.id === id);
    if (!confirm(`Delete this time entry for ${entry.clientName}?`)) return;
    
    timesheetEntries = timesheetEntries.filter(e => e.id !== id);
    saveTimesheetEntries();
    updateTimesheetSummary();
    renderTimesheetEntries();
    showToast('Entry deleted', 'success');
}

// Edit Timesheet Entry
function editTimesheetEntry(id) {
    const entry = timesheetEntries.find(e => e.id === id);
    if (!entry) return;
    
    // Populate the edit form
    document.getElementById('editEntryId').value = entry.id;
    
    // Populate client selector
    const clientOptions = clients
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`)
        .join('');
    document.getElementById('editEntryClient').innerHTML = '<option value="">Select client</option>' + clientOptions;
    document.getElementById('editEntryClient').value = entry.clientId;
    
    document.getElementById('editEntryDate').value = entry.date;
    
    // Convert ISO times to HH:MM format
    const startTime = new Date(entry.startTime);
    const endTime = new Date(entry.endTime);
    document.getElementById('editEntryStartTime').value = 
        `${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`;
    document.getElementById('editEntryEndTime').value = 
        `${String(endTime.getHours()).padStart(2, '0')}:${String(endTime.getMinutes()).padStart(2, '0')}`;
    
    document.getElementById('editEntryRate').value = entry.hourlyRate;
    
    document.getElementById('timesheetEditModal').classList.add('active');
}

function closeTimesheetEditModal() {
    document.getElementById('timesheetEditModal').classList.remove('active');
}

function saveTimesheetEdit(e) {
    e.preventDefault();
    
    const id = document.getElementById('editEntryId').value;
    const entry = timesheetEntries.find(e => e.id === id);
    if (!entry) return;
    
    const clientId = document.getElementById('editEntryClient').value;
    const client = clients.find(c => c.id === clientId);
    const date = document.getElementById('editEntryDate').value;
    const startTimeStr = document.getElementById('editEntryStartTime').value;
    const endTimeStr = document.getElementById('editEntryEndTime').value;
    const hourlyRate = parseFloat(document.getElementById('editEntryRate').value) || 0;
    
    // Create full datetime objects
    const startTime = new Date(`${date}T${startTimeStr}:00`);
    const endTime = new Date(`${date}T${endTimeStr}:00`);
    
    // Handle overnight shifts
    if (endTime <= startTime) {
        endTime.setDate(endTime.getDate() + 1);
    }
    
    const duration = endTime - startTime;
    const hoursWorked = duration / 3600000;
    const earnings = hoursWorked * hourlyRate;
    
    // Update entry
    entry.clientId = clientId;
    entry.clientName = client ? client.name : 'Unknown';
    entry.date = date;
    entry.startTime = startTime.toISOString();
    entry.endTime = endTime.toISOString();
    entry.duration = duration;
    entry.hoursWorked = hoursWorked;
    entry.hourlyRate = hourlyRate;
    entry.earnings = earnings;
    
    saveTimesheetEntries();
    closeTimesheetEditModal();
    updateTimesheetSummary();
    renderTimesheetEntries();
    showToast('Entry updated!', 'success');
}

// ============================================
// EXPORT DATA FUNCTIONS
// ============================================

function openExportDataModal() {
    document.getElementById('exportDataModal').classList.add('active');
}

function closeExportDataModal() {
    document.getElementById('exportDataModal').classList.remove('active');
}

function downloadFile(content, filename, type = 'application/json') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

function exportAllData() {
    const data = {
        exportDate: new Date().toISOString(),
        user: currentUser?.fullName || 'Unknown',
        tasks: tasks,
        clients: clients,
        reminders: reminders,
        timesheetEntries: timesheetEntries
    };
    
    const filename = `scheduler-backup-${formatDate(new Date())}.json`;
    downloadFile(JSON.stringify(data, null, 2), filename);
    showToast('All data exported!', 'success');
    closeExportDataModal();
}

function exportTasks() {
    const data = {
        exportDate: new Date().toISOString(),
        tasks: tasks
    };
    
    const filename = `tasks-${formatDate(new Date())}.json`;
    downloadFile(JSON.stringify(data, null, 2), filename);
    showToast('Tasks exported!', 'success');
    closeExportDataModal();
}

function exportClients() {
    const data = {
        exportDate: new Date().toISOString(),
        clients: clients
    };
    
    const filename = `clients-${formatDate(new Date())}.json`;
    downloadFile(JSON.stringify(data, null, 2), filename);
    showToast('Clients exported!', 'success');
    closeExportDataModal();
}

function exportReminders() {
    const data = {
        exportDate: new Date().toISOString(),
        reminders: reminders
    };
    
    const filename = `reminders-${formatDate(new Date())}.json`;
    downloadFile(JSON.stringify(data, null, 2), filename);
    showToast('Reminders exported!', 'success');
    closeExportDataModal();
}

function exportTimesheet() {
    const data = {
        exportDate: new Date().toISOString(),
        timesheetEntries: timesheetEntries
    };
    
    const filename = `timesheet-${formatDate(new Date())}.json`;
    downloadFile(JSON.stringify(data, null, 2), filename);
    showToast('Timesheet exported!', 'success');
    closeExportDataModal();
}

function exportTimesheetCSV() {
    if (timesheetEntries.length === 0) {
        showToast('No timesheet entries to export', 'error');
        return;
    }
    
    // CSV header
    let csv = 'Date,Client,Start Time,End Time,Hours,Hourly Rate,Earnings\n';
    
    // Sort by date
    const sortedEntries = [...timesheetEntries].sort((a, b) => 
        new Date(a.startTime) - new Date(b.startTime)
    );
    
    sortedEntries.forEach(entry => {
        const startTime = new Date(entry.startTime);
        const endTime = new Date(entry.endTime);
        const hours = entry.hoursWorked.toFixed(2);
        
        csv += `${entry.date},`;
        csv += `"${entry.clientName}",`;
        csv += `${formatTimeFromDate(startTime)},`;
        csv += `${formatTimeFromDate(endTime)},`;
        csv += `${hours},`;
        csv += `${entry.hourlyRate.toFixed(2)},`;
        csv += `${entry.earnings.toFixed(2)}\n`;
    });
    
    // Add totals
    const totalHours = timesheetEntries.reduce((sum, e) => sum + e.hoursWorked, 0);
    const totalEarnings = timesheetEntries.reduce((sum, e) => sum + e.earnings, 0);
    csv += `\nTOTAL,,,,"${totalHours.toFixed(2)}",,"${totalEarnings.toFixed(2)}"`;
    
    const filename = `timesheet-${formatDate(new Date())}.csv`;
    downloadFile(csv, filename, 'text/csv');
    showToast('Timesheet CSV exported!', 'success');
    closeExportDataModal();
}

// ============================================
// ICS CALENDAR EXPORT FUNCTIONS
// ============================================

function formatICSDate(dateStr, timeStr) {
    // Convert date and time to ICS format: YYYYMMDDTHHMMSS
    const date = new Date(`${dateStr}T${timeStr}`);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = '00';
    
    return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

function formatICSDateOnly(dateStr) {
    // Convert date to ICS date-only format: YYYYMMDD
    const parts = dateStr.split('-');
    return `${parts[0]}${parts[1]}${parts[2]}`;
}

function generateUID() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}@va-scheduler`;
}

function escapeICSText(text) {
    if (!text) return '';
    return text
        .replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n');
}

function createICSEvent(event) {
    const now = new Date();
    const timestamp = formatICSDate(formatDate(now), `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    
    let icsEvent = 'BEGIN:VEVENT\r\n';
    icsEvent += `UID:${event.uid}\r\n`;
    icsEvent += `DTSTAMP:${timestamp}\r\n`;
    icsEvent += `DTSTART:${event.start}\r\n`;
    
    if (event.end) {
        icsEvent += `DTEND:${event.end}\r\n`;
    }
    
    icsEvent += `SUMMARY:${escapeICSText(event.title)}\r\n`;
    
    if (event.description) {
        icsEvent += `DESCRIPTION:${escapeICSText(event.description)}\r\n`;
    }
    
    if (event.location) {
        icsEvent += `LOCATION:${escapeICSText(event.location)}\r\n`;
    }
    
    // Add alarm/reminder if specified
    if (event.alarm) {
        icsEvent += 'BEGIN:VALARM\r\n';
        icsEvent += 'ACTION:DISPLAY\r\n';
        icsEvent += `DESCRIPTION:${escapeICSText(event.title)}\r\n`;
        icsEvent += `TRIGGER:-PT${event.alarm}M\r\n`;
        icsEvent += 'END:VALARM\r\n';
    }
    
    icsEvent += 'END:VEVENT\r\n';
    
    return icsEvent;
}

function createICSFile(events, calendarName) {
    let ics = 'BEGIN:VCALENDAR\r\n';
    ics += 'VERSION:2.0\r\n';
    ics += 'PRODID:-//VA Scheduler//EN\r\n';
    ics += `X-WR-CALNAME:${calendarName}\r\n`;
    ics += 'CALSCALE:GREGORIAN\r\n';
    ics += 'METHOD:PUBLISH\r\n';
    
    events.forEach(event => {
        ics += createICSEvent(event);
    });
    
    ics += 'END:VCALENDAR\r\n';
    
    return ics;
}

function exportTasksICS() {
    if (tasks.length === 0) {
        showToast('No tasks to export', 'error');
        return;
    }
    
    const events = tasks.map(task => {
        const client = clients.find(c => c.id === task.clientId);
        const clientName = client ? ` [${client.name}]` : '';
        
        let description = task.description || '';
        if (client) {
            description += `\nClient: ${client.name}`;
        }
        description += `\nUrgency: ${task.urgency}`;
        
        const event = {
            uid: generateUID(),
            title: task.title + clientName,
            start: formatICSDate(task.date, task.startTime),
            description: description.trim()
        };
        
        // Add end time if specified
        if (task.endTime) {
            event.end = formatICSDate(task.date, task.endTime);
        } else {
            // Default 1 hour duration
            const startDate = new Date(`${task.date}T${task.startTime}`);
            startDate.setHours(startDate.getHours() + 1);
            event.end = formatICSDate(task.date, `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`);
        }
        
        // Add reminder alarm if task has reminder
        if (task.reminder && task.reminder > 0) {
            event.alarm = task.reminder;
        }
        
        return event;
    });
    
    const ics = createICSFile(events, 'VA Scheduler Tasks');
    const filename = `tasks-${formatDate(new Date())}.ics`;
    downloadFile(ics, filename, 'text/calendar');
    showToast(`${tasks.length} tasks exported to calendar!`, 'success');
    closeExportDataModal();
}

function exportRemindersICS() {
    if (reminders.length === 0) {
        showToast('No reminders to export', 'error');
        return;
    }
    
    const events = reminders.map(reminder => {
        const client = clients.find(c => c.id === reminder.clientId);
        const clientName = client ? ` [${client.name}]` : '';
        const typeLabel = reminder.type ? ` (${reminder.type})` : '';
        
        let description = reminder.description || '';
        if (reminder.type) {
            description += `\nType: ${reminder.type}`;
        }
        if (client) {
            description += `\nClient: ${client.name}`;
        }
        description += `\nUrgency: ${reminder.urgency}`;
        
        const event = {
            uid: generateUID(),
            title: reminder.title + typeLabel + clientName,
            start: formatICSDate(reminder.date, reminder.startTime),
            description: description.trim()
        };
        
        // Add end time if specified
        if (reminder.endTime) {
            event.end = formatICSDate(reminder.date, reminder.endTime);
        } else {
            // Default 30 min duration for reminders
            const startDate = new Date(`${reminder.date}T${reminder.startTime}`);
            startDate.setMinutes(startDate.getMinutes() + 30);
            event.end = formatICSDate(reminder.date, `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`);
        }
        
        // Add alarm
        if (reminder.reminderTime && reminder.reminderTime > 0) {
            event.alarm = reminder.reminderTime;
        }
        
        return event;
    });
    
    const ics = createICSFile(events, 'VA Scheduler Reminders');
    const filename = `reminders-${formatDate(new Date())}.ics`;
    downloadFile(ics, filename, 'text/calendar');
    showToast(`${reminders.length} reminders exported to calendar!`, 'success');
    closeExportDataModal();
}

function exportAllCalendarICS() {
    if (tasks.length === 0 && reminders.length === 0) {
        showToast('No tasks or reminders to export', 'error');
        return;
    }
    
    const events = [];
    
    // Add tasks
    tasks.forEach(task => {
        const client = clients.find(c => c.id === task.clientId);
        const clientName = client ? ` [${client.name}]` : '';
        
        let description = task.description || '';
        if (client) {
            description += `\nClient: ${client.name}`;
        }
        description += `\nUrgency: ${task.urgency}`;
        description += `\nType: Task`;
        
        const event = {
            uid: generateUID(),
            title: `📋 ${task.title}${clientName}`,
            start: formatICSDate(task.date, task.startTime),
            description: description.trim()
        };
        
        if (task.endTime) {
            event.end = formatICSDate(task.date, task.endTime);
        } else {
            const startDate = new Date(`${task.date}T${task.startTime}`);
            startDate.setHours(startDate.getHours() + 1);
            event.end = formatICSDate(task.date, `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`);
        }
        
        if (task.reminder && task.reminder > 0) {
            event.alarm = task.reminder;
        }
        
        events.push(event);
    });
    
    // Add reminders
    reminders.forEach(reminder => {
        const client = clients.find(c => c.id === reminder.clientId);
        const clientName = client ? ` [${client.name}]` : '';
        const typeLabel = reminder.type ? ` (${reminder.type})` : '';
        
        let description = reminder.description || '';
        if (reminder.type) {
            description += `\nType: ${reminder.type}`;
        }
        if (client) {
            description += `\nClient: ${client.name}`;
        }
        description += `\nUrgency: ${reminder.urgency}`;
        description += `\nCategory: Reminder`;
        
        const event = {
            uid: generateUID(),
            title: `🔔 ${reminder.title}${typeLabel}${clientName}`,
            start: formatICSDate(reminder.date, reminder.startTime),
            description: description.trim()
        };
        
        if (reminder.endTime) {
            event.end = formatICSDate(reminder.date, reminder.endTime);
        } else {
            const startDate = new Date(`${reminder.date}T${reminder.startTime}`);
            startDate.setMinutes(startDate.getMinutes() + 30);
            event.end = formatICSDate(reminder.date, `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`);
        }
        
        if (reminder.reminderTime && reminder.reminderTime > 0) {
            event.alarm = reminder.reminderTime;
        }
        
        events.push(event);
    });
    
    const ics = createICSFile(events, 'VA Scheduler');
    const filename = `calendar-${formatDate(new Date())}.ics`;
    downloadFile(ics, filename, 'text/calendar');
    showToast(`${events.length} events exported to calendar!`, 'success');
    closeExportDataModal();
}

// Add modal close listeners for new modals
document.addEventListener('click', (e) => {
    if (e.target.id === 'timesheetEditModal') closeTimesheetEditModal();
    if (e.target.id === 'exportDataModal') closeExportDataModal();
    if (e.target.id === 'statsModal') closeStatsModal();
});

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}