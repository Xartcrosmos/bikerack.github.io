const urlParams = new URLSearchParams(window.location.search);
const SUPABASE_URL = "https://lguyiavotyrxdlyhsvmz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxndXlpYXZvdHlyeGRseWhzdm16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNzQ0MjQsImV4cCI6MjA4NDc1MDQyNH0.f1hT0B68mv2lxVsQldk3ABx_0yBBUK2t1fcRHWGhmyM";
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const TOTAL_SLOTS_PER_UNIT = 2;

let allUnits = [];
let adminId = null;
let unitMap = {};

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    sidebar.classList.toggle('active');
}

// Optional: Close sidebar when clicking a nav button
document.querySelectorAll('.sidebar nav button').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelector('.sidebar').classList.remove('active');
    });
});

function getLetterFromIndex(index) {
return String.fromCharCode(65 + index);
}
async function init() {
const urlParams = new URLSearchParams(window.location.search);
const rawId = urlParams.get('id');

alert("Checking ID from URL...\nValue: " + rawId + "\nType: " + typeof rawId);

if (!rawId) {
alert("Error: No 'id' parameter found in the URL! \n\nMake sure your URL looks like: admin.html?id=123");
return;
}
adminId = parseInt(rawId);
await fetchOwnedUnits();
showSection('view-racks');
}
async function init() {
const urlParams = new URLSearchParams(window.location.search);
adminId = urlParams.get('id');

if (!adminId) {
alert("No Admin ID found in URL!");
return;
}

await fetchOwnedUnits();

// 3. Initial Load
showSection('view-racks');
}
async function fetchOwnedUnits() {
const { data, error } = await client
.from('device_unit')
.select('uuid, created_at')
.eq('admin_id', adminId)
.order('created_at', { ascending: true }); 

if (error) {
alert("Database Error: " + error.message);
return;
}

if (!data || data.length === 0) {
alert("No units found where admin_id = " + adminId);
allUnits = []; 
} else {
allUnits = data.map(item => item.uuid);

data.forEach((unit, index) => {
unitMap[unit.uuid] = getLetterFromIndex(index);
});
}
}

// This function handles the "Dynamic Info" for any row clicked
function openDynamicModal(title, infoObject) {
    // These IDs now match your HTML exactly
    const modal = document.getElementById('dynamic-modal');
    const titleElement = document.getElementById('dynamic-title');
    const infoElement = document.getElementById('dynamic-info');

    if (!modal || !infoElement) {
        console.error("Modal elements not found!");
        return;
    }

    titleElement.innerText = title;

    // Fill the info div
    infoElement.innerHTML = Object.entries(infoObject).map(([label, value]) => `
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee;">
            <strong style="color: #666;">${label}:</strong>
            <span style="color: #333; font-weight: 500;">${value || '--'}</span>
        </div>
    `).join('');

    modal.style.display = 'flex';
}



function openEditModal(id, name, contact) {
document.getElementById('edit-user-id').value = id;
document.getElementById('edit-name').value = name === 'null' ? '' : name;
document.getElementById('edit-contact').value = contact === 'null' ? '' : contact;
document.getElementById('edit-modal').style.display = 'flex';
}

function openDeleteModal(id) {
document.getElementById('delete-user-id').value = id;
document.getElementById('delete-modal').style.display = 'flex';
}

function closeModal(modalId) {
document.getElementById(modalId).style.display = 'none';
}

async function saveUserEdit() {
const id = document.getElementById('edit-user-id').value;
const name = document.getElementById('edit-name').value;
const contact = document.getElementById('edit-contact').value;

const { error } = await client
.from('registration')
.update({ name: name, contact: contact })
.eq('id', id);

if (error) alert("Update failed: " + error.message);
else {
closeModal('edit-modal');
loadUserData();
}
}

async function confirmDeleteUser() {
const id = document.getElementById('delete-user-id').value;

const { error } = await client
.from('registration')
.update({status : '-1'})
.eq('id', id);

if (error) alert("Delete failed: " + error.message);
    else {
    closeModal('delete-modal');
    loadUserData();
    }
}
async function loadRackData() {
const tableBody = document.getElementById('rack-table-body');
tableBody.innerHTML = "<tr><td colspan='4' class='center-text'>Fetching...</td></tr>";

const unitUUIDs = Object.keys(unitMap);

if (unitUUIDs.length === 0) {
tableBody.innerHTML = "<tr><td colspan='4'>No units assigned to this admin.</td></tr>";
return;
}

const { data, error } = await client
.from('rack_sessions')
.select('device_uuid, user_id, slot, status, created_at, registration (name)')
.in('device_uuid', unitUUIDs)
.order('created_at', { ascending: false }); 

if (error) {
alert("Rack Sessions Error: " + error.message);
return;
}

// 2. Filter data in JavaScript to find the *latest* session for each unique Unit/Slot combo
const latestSessions = {};
if (data && data.length > 0) {
data.forEach(session => {
const key = `${session.device_uuid}-${session.slot}`;
if (!latestSessions[key]) {
latestSessions[key] = session;
}
});
}

// 3. Generate HTML rows by iterating through ALL possible slots (1 to 4)
let rowsHtml = '';
// Sort units alphabetically by their letter name (A, B, C...)
const sortedUnitUUIDs = Object.keys(unitMap).sort((a, b) => unitMap[a].localeCompare(unitMap[b]));

sortedUnitUUIDs.forEach(uuid => {
for (let slot = 1; slot <= TOTAL_SLOTS_PER_UNIT; slot++) {
const sessionKey = `${uuid}-${slot}`;
const sessionData = latestSessions[sessionKey];
const unitLetter = unitMap[uuid];

let displayUserId = '--';
let displayStatus = 'IDLE';

// If we found a real, recent session for this specific slot
if (sessionData) {
const isIdle = (sessionData.status === 3 || sessionData.status === '3');
const userName = sessionData.registration ? sessionData.registration.name : sessionData.user_id;
displayUserId = isIdle ? '--' : userName; 
displayStatus = isIdle ? 'IDLE' : 'ACTIVE';
}

rowsHtml += `
<tr onclick="openDynamicModal('Rack Status', { 'Unit': '${unitLetter}', 'Slot': '${slot}', 'User': '${displayUserId}', 'Status': '${displayStatus}' })">
    <td><strong>${unitLetter}</strong></td>
    <td>${slot}</td>
    <td>${displayUserId}</td>
    <td><strong>${displayStatus}</strong></td>
</tr>`;
}
});

tableBody.innerHTML = rowsHtml || "<tr><td colspan='4'>No session data found.</td></tr>";
}

async function loadUserData() {
const tableBody = document.getElementById('user-table-body');
tableBody.innerHTML = "<tr><td colspan='5' class='center-text';>Loading users...</td></tr>";

const { data, error } = await client
.from('registration')
.select('id, created_at, device_uuid, name, contact')
.in('device_uuid', allUnits) 
.eq('status', 3)
.order('created_at', { ascending: false }); 

if (error) {
alert("Error: " + error.message);
return;
}
let rowsHtml = '';
data.forEach(user => {
const regDate = new Date(user.created_at).toLocaleString(undefined, {month: 'short',day: 'numeric',year: 'numeric',hour: '2-digit',minute: '2-digit'});
const unitLetter = unitMap[user.device_uuid] || '?';

rowsHtml += `
<tr onclick="openDynamicModal('User Details', { 'Name': '${user.name}', 'Contact': '${user.contact}', 'Unit': '${unitLetter}' })">
    <td>${regDate}</td>
    <td><strong>Unit ${unitLetter}</strong></td>
    <td>${user.name || '--'}</td>
    <td>${user.contact || '--'}</td>
    <td>
        <button onclick="event.stopPropagation(); openEditModal('${user.id}', '${user.name}', '${user.contact}')">Edit</button>
        <button onclick="event.stopPropagation(); openDeleteModal('${user.id}')">Delete</button>
    </td> 
</tr>`;

});

tableBody.innerHTML = rowsHtml || "<tr><td colspan='5'>No users found.</td></tr>";
}

async function loadSessionLogs() {
const tableBody = document.getElementById('session-table-body');
tableBody.innerHTML = "<tr><td colspan='8' class='center-text'>Fetching completed logs...</td></tr>";

const { data, error } = await client
.from('rack_sessions')
.select(`
device_uuid, 
slot, 
user_id, 
timein, 
timeout, 
status,
registration ( name )
`)
.in('device_uuid', allUnits)
.eq('status', 3)
.order('timein', { ascending: false });

if (error) {
alert("Error: " + error.message);
return;
}

let rowsHtml = '';
data.forEach(log => {
const unitLetter = unitMap[log.device_uuid] || '?';
const userName = log.registration ? log.registration.name : "Unknown";

const dateObj = new Date(log.timein);
const dateStr = dateObj.toLocaleDateString(undefined, { 
month: 'short', 
day: 'numeric', 
year: 'numeric' 
});

const timeInStr = log.timein ? new Date(log.timein).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
const timeOutStr = log.timeout ? new Date(log.timeout).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';

let durationStr = '--';
if (log.timein && log.timeout) {
const diffMs = new Date(log.timeout) - new Date(log.timein);
const diffMins = Math.floor(diffMs / 60000);
durationStr = `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
}

rowsHtml += `
<tr onclick="openDynamicModal('Session Log', { 
    'Date': '${dateStr}', 
    'Unit': '${unitLetter}', 
    'Slot': '${log.slot}', 
    'User': '${userName}', 
    'Duration': '${durationStr}' 
})">
    <td>${dateStr}</td>
    <td><strong>Unit ${unitLetter}</strong></td>
    <td>Slot ${log.slot}</td>
    <td>${userName}</td>
    <td>${log.user_id}</td>
    <td>${timeInStr}</td>
    <td>${timeOutStr}</td>
    <td><strong>${durationStr}</strong></td>
</tr>`;
});

tableBody.innerHTML = rowsHtml || "<tr><td colspan='8'>No logs found.</td></tr>";
}

function showSection(sectionId) {
document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
document.getElementById(sectionId).style.display = 'block';

if (sectionId === 'view-racks') {
loadRackData();	
} else if (sectionId === 'manage-users') {
loadUserData(); 
} else if (sectionId === 'session-logs') {
loadSessionLogs(); 
}
}
window.onload = init;

