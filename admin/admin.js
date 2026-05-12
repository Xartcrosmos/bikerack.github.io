const urlParams = new URLSearchParams(window.location.search);
    
    if (!urlParams.has('id')) {
        window.location.search = `?id=${DEFAULT_ID}`;
    }

    const SUPABASE_URL = "https://lguyiavotyrxdlyhsvmz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxndXlpYXZvdHlyeGRseWhzdm16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNzQ0MjQsImV4cCI6MjA4NDc1MDQyNH0.f1hT0B68mv2lxVsQldk3ABx_0yBBUK2t1fcRHWGhmyM";
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const navItems = document.querySelectorAll('.nav-item');
const panels = document.querySelectorAll('.admin-panel');
const sidebarBtn = document.getElementById("toggleSidebar");

// Get the ID from the URL we just validated
const adminId = urlParams.get('id');

// This will hold your array of device_uuids once fetched
let allUnit = [];
let unitMapping = {}

function showSettingsSection(sectionId, btn) {
    // 1. Manually hide EVERY content div in the settings panel
    const sections = document.querySelectorAll('.settings-content');
    sections.forEach(section => {
        section.setAttribute('style', 'display: none !important');
        section.classList.remove('active-tab');
    });

    // 2. Manually show the ONE you want
    const target = document.getElementById(sectionId);
    if (target) {
        target.setAttribute('style', 'display: block !important');
        target.classList.add('active-tab');
    }

    // 3. Fix the buttons
    document.querySelectorAll('.btn-settings-tab').forEach(b => {
        b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');
}
// 1. Updated fetch to return the array directly
async function fetchAdminUnits() {
    const { data, error } = await client
        .from('device_unit')
        .select('uuid')
        .eq('admin_id', adminId)
        .order('created_at', { ascending: true }); // Ordering ensures Unit A is always the oldest/first

    if (error) return [];

    const ids = data.map(item => item.uuid);
    allUnit = ids;

    // Reset and fill the mapping
    unitMapping = {};
    ids.forEach((id, index) => {
        unitMapping[id] = String.fromCharCode(65 + index); 
    });

    return ids;
}

// This runs the function automatically when the page loads
document.addEventListener('DOMContentLoaded', () => {
    loadDashboardStats();
});

async function requestVerification(task) {
    const modal = document.getElementById('modal-verify');
    const statusText = document.getElementById('verify-status');
    const input = document.getElementById('verify-input');
    const btn = document.getElementById('verify-confirm-btn');

    // 1. Show modal IMMEDIATELY
    input.value = "";
    input.style.border = "1px solid #ddd";
    statusText.innerText = "Sending OTP to your email...";
    statusText.style.color = "#666";
    modal.style.display = 'flex';

    // 2. Start background tasks (don't block the modal display)
    const { data } = await client.from('admins').select('email').eq('id', adminId).single();
    if (!data?.email) {
        statusText.innerText = "Error: Admin email not found.";
        return;
    }

    const adminEmail = data.email;
    const { error: otpError } = await client.auth.signInWithOtp({ email: adminEmail });

    if (otpError) {
        statusText.innerText = "Failed to send OTP.";
        statusText.style.color = "#fa5252";
        return;
    }

    statusText.innerText = "OTP sent! Please check your email.";

    // 3. Handle Confirmation
    btn.onclick = async () => {
        btn.disabled = true; // Prevent double clicks
        statusText.innerText = "Verifying...";

        const { error: verifyError } = await client.auth.verifyOtp({
            email: adminEmail,
            token: input.value,
            type: 'email'
        });

        if (verifyError) {
            statusText.innerText = "Wrong or Expired OTP";
            statusText.style.color = "#fa5252";
            input.style.border = "2px solid #fa5252";
            btn.disabled = false;
        } else {
            statusText.innerText = "Identity Verified!";
            statusText.style.color = "#2b8a3e";
            
            // Run the actual task (password change)
            await task(); 

            statusText.innerText = "Password successfully changed!";
            
            // Short delay so they can read the success message
            setTimeout(() => {
                closeModals();
                btn.disabled = false;
            }, 1500);
        }
    };
}

function saveNewPassword() {
    // 1. Grab the REAL password immediately
    const realPassword = document.getElementById('settings-new-pass').value;

    requestVerification(async () => {
        // 2. Perform the update using the variable
        const { error } = await client
            .from('admins')
            .update({ password_hash: realPassword })
            .eq('id', adminId); 

        if (error) {
            console.error("Update failed:", error.message);
        } else {
            console.log("Success!");
            // 3. ONLY reset the UI here, after the DB is updated
            resetPasswordUI();
        }
    });
}

function handleUnlinkDevices() {
    requestVerification(async () => {
        // Your logic to wipe device_unit table
        console.log("Devices unlinked successfully.");
    });
}

let isEditingPassword = false;

function togglePasswordEdit() {
    const passInput = document.getElementById('settings-new-pass');
    const toggleBtn = document.getElementById('password-toggle-btn');

    if (!isEditingPassword) {
        // Switch to EDIT mode
        isEditingPassword = true;
        passInput.readOnly = false;
        passInput.disabled = false;
        passInput.type = "text"; // Show password while typing
        passInput.value = "";    // Clear the mask
        passInput.focus();
        toggleBtn.innerText = "Save";
    } else {
        // Trigger the Confirmation Modal
        openPasswordConfirmModal();
    }
}

function openPasswordConfirmModal() {
    const modal = document.getElementById('modal-confirm');
    document.getElementById('confirm-title').innerText = "Change Password";
    document.getElementById('confirm-msg').innerText = "Are you sure? You will need to verify via email OTP.";
    
    modal.style.display = 'flex';
    
    document.getElementById('confirm-yes-btn').onclick = () => {
        closeModals(); // Close the "Are you sure?" modal
        saveNewPassword(); // This triggers requestVerification + your table update
    };

    document.getElementById('confirm-no-btn').onclick = () => {
        closeModals(); // Close the "Are you sure?" modal
        resetPasswordUI(); 
    };
}

function resetPasswordUI() {
    const passInput = document.getElementById('settings-new-pass');
    const toggleBtn = document.getElementById('password-toggle-btn');
    
    isEditingPassword = false;
    passInput.readOnly = true;
    passInput.disabled = true;
    passInput.type = "password";
    passInput.value = "********"; // Re-mask it
    toggleBtn.innerText = "Edit";
}
async function loadAdminSettings() {
    const { data, error } = await client
        .from('admins')
        .select('email')
        .eq('id', adminId)
        .single();

    if (data && !error) {
        document.getElementById('settings-email').value = data.email;
    } else {
        console.error("Error loading email:", error);
    }
}

// Call this when the page loads
loadAdminSettings();
async function loadDashboardStats() {
    // 1. Fetch Total Units
    const { data: unitData, count: unitCount, error: err1 } = await client
        .from('device_unit')
        .select('availability', { count: 'exact'})
        .eq('admin_id', adminId);

    // 2. Fetch ALL sessions to calculate both Live and Stats
    const { data: allSessions, error: err2 } = await client
        .from('rack_sessions')
        .select('status, user_id, device_uuid, timein, timeout')
        .in('device_uuid', allUnit);

    if (err1 || err2 || !allSessions) return;

    const now = new Date();
    const oneMin = 60000; // 60 seconds in milliseconds
    
    // Check how many units are checking in
    const onlineCount = (unitData || []).filter(u => (now - new Date(u.availability)) < oneMin).length;
    const totalCount = unitCount || 0; // Use the unitCount we already fetched

    const dot = document.getElementById('status-dot');
    const txt = document.getElementById('status-text');
    const names = document.getElementById('unit-names');

    if (totalCount > 0 && onlineCount === totalCount) {
        dot.style.color = "#0ca678"; txt.innerText = "Online"; txt.style.color = "#0ca678";
        names.innerText = `(${totalCount} Units)`;
    } else if (onlineCount > 0) {
        dot.style.color = "#fab005"; txt.innerText = "Partial"; txt.style.color = "#fab005";
        names.innerText = `(${onlineCount}/${totalCount} Online)`;
    } else {
        dot.style.color = "#fa5252"; txt.innerText = "Offline"; txt.style.color = "#fa5252";
        names.innerText = totalCount > 0 ? `(${totalCount} Units)` : "";
    }
    
    // --- CALCULATIONS ---
    const totalRacks = unitCount || 0;
    const totalSlots = totalRacks * 2;
    
    // Live Counters Logic
    const occupied = allSessions.filter(s => s.status === 1).length;
    const available = totalSlots - occupied;

    // Leaderboard Logic (Usage Stats)
    const userDurations = {}, rackCounts = {}, hourCounts = Array(24).fill(0);

    allSessions.forEach(s => {
        if (s.status === 3 && s.timeout) { // Only for completed sessions
            const hrs = (new Date(s.timeout) - new Date(s.timein)) / 3600000;
            userDurations[s.user_id] = (userDurations[s.user_id] || 0) + hrs;
            rackCounts[s.device_uuid] = (rackCounts[s.device_uuid] || 0) + 1;
            hourCounts[new Date(s.timein).getHours()]++;
        }
    });

    // Find the winners
    const topUID = Object.keys(userDurations).reduce((a, b) => userDurations[a] > userDurations[b] ? a : b, "N/A");
    const topRID = Object.keys(rackCounts).reduce((a, b) => rackCounts[a] > rackCounts[b] ? a : b, "N/A");
    const peakH = hourCounts.indexOf(Math.max(...hourCounts));

    // --- UPDATE UI ---
    document.getElementById('total_racks').innerText = totalRacks;
    document.getElementById('total_slot').innerText = totalSlots;
    document.getElementById('occupied_racks').innerText = occupied;
    document.getElementById('available_racks').innerText = available > 0 ? available : 0;

    // Update Leaderboard IDs
    document.getElementById('stat-top-user').innerText = topUID !== "N/A" ? `User #${topUID.substring(0, 5)}` : "No Data";
    document.getElementById('stat-top-user-val').innerText = topUID !== "N/A" ? `${userDurations[topUID].toFixed(1)} Total Hours` : "0 Hours";
    document.getElementById('stat-top-rack').innerText = topRID !== "N/A" ? `Unit ${topRID.substring(0, 5)}` : "No Data";
    document.getElementById('stat-top-rack-val').innerText = topRID !== "N/A" ? `${rackCounts[topRID]} Total Sessions` : "0 Sessions";
    document.getElementById('stat-peak-time').innerText = `${peakH % 12 || 12}:00 ${peakH >= 12 ? 'PM' : 'AM'}`;
}

// Call this inside your home-btn click and on initial load
document.getElementById('home-btn').addEventListener('click', () => {

    
    loadDashboardStats();
});

// 2. Updated load to wait properly
async function loadRackStatus() {
    const tbody = document.getElementById('racks-tbody');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading rack data...</td></tr>';

    // 1. Force the wait for IDs
    let unitIds = allUnit.length > 0 ? allUnit : await fetchAdminUnits();

    // 2. STOP if no IDs found (prevents the freeze)
    if (!unitIds || unitIds.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No units found for this Admin ID.</td></tr>';
        return;
    }

    // 3. The Query
// ... existing query code above ...
    const { data, error } = await client
        .from('rack_sessions')
        .select(`
            *,
            registration:user_id (name)
        `)
        .in('device_uuid', unitIds) 
        .order('created_at', { ascending: false });

    // --- The New Logic: Ensure 2 slots per unit ---
    const latestSlots = {};

    // 1. First, pre-fill every unit with "Empty" Slot 1 and Slot 2
unitIds.forEach(id => {
        const letter = unitMapping[id];
        latestSlots[`${id}-1`] = { unit_label: letter, slot: 1, display_name: '', status: 'INACTIVE' };
        latestSlots[`${id}-2`] = { unit_label: letter, slot: 2, display_name: '', status: 'INACTIVE' };
    });

    // 2. Overwrite with actual data from Supabase if it exists
// Inside the loop in loadRackStatus:
    data.forEach(row => {
        const key = `${row.device_uuid}-${row.slot}`;
        if (latestSlots[key] && latestSlots[key].display_name === '') {
            const letter = unitMapping[row.device_uuid] || '?';
            
            const statusText = row.status == 1 ? 'ACTIVE' : 'INACTIVE';
            const name = (statusText === 'ACTIVE' && row.registration) ? row.registration.name : '';

            latestSlots[key] = {
                unit_label: letter,
                slot: row.slot,
                display_name: name,
                status: statusText
            };
        }
    });

    renderRacksTable(Object.values(latestSlots));
}

async function loadManageUsers() {
    const tbody = document.getElementById('users-tbody'); // Ensure this ID exists in your HTML
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading registered users...</td></tr>';

    const { data, error } = await client
        .from('registration')
        .select('*')
        .eq('admin_id', adminId)
        .eq('status', 3)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("User Fetch Error:", error);
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Error loading users.</td></tr>';
        return;
    }

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No completed registrations found.</td></tr>';
        return;
    }

    renderUsersTable(data);
}

async function loadSessionLogs() {
    const tbody = document.getElementById('logs-tbody');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading session history...</td></tr>';

    const { data, error } = await client
        .from('rack_sessions')
        .select(`
            *,
            registration:user_id (name)
        `)
        .eq('admin_id', adminId)
        .eq('status', 3)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Logs Fetch Error:", error);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:red;">Error loading logs.</td></tr>';
        return;
    }

    renderLogsTable(data);
}
    // Execute immediately on load
    fetchAdminUnits();

    // This runs automatically on page load/reload
    document.getElementById('panel-default').classList.add('active-panel');
    // Ensure no sidebar items are highlighted initially
    navItems.forEach(nav => nav.classList.remove('active'));

    // --- 1. Top Header Trigger (Default Panel) ---
    document.getElementById('home-btn').addEventListener('click', () => {
        hideAllPanas(); // Hide any open Racks, Users, etc.
        document.getElementById('panel-default').classList.add('active-panel'); // Show Dashboard
        
        // Clear sidebar highlights so no menu option looks "stuck"
        navItems.forEach(nav => nav.classList.remove('active'));
    });

    // --- 2. Sidebar Menu Triggers ---
    navItems.forEach(item => {
        item.addEventListener('click', function() {
            const label = this.querySelector('span').innerText;

            // Ignore "Menu" and "Logout" for panel switching
            if (label === "Menu" || label === "Logout") return;

            // Set the "active" class on the button (your trigger)
            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');

            // Execute the panel switch based on the label
            switchPanel(label);
        });
    });

    // Helper: Hide everything
    function hideAllPanas() {
        panels.forEach(p => p.classList.remove('active-panel'));
    }

function renderRacksTable(sessionData) {
    const tbody = document.getElementById('racks-tbody');
    
    if (sessionData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No sessions found.</td></tr>';
        return;
    }
tbody.innerHTML = sessionData.map(row => {
        // Apply styling based on the new text status
        const statusClass = row.status === 'ACTIVE' ? 'online' : 'offline';
        
        return `
            <tr>
                <td style="font-weight: bold; color: #006adb;">Unit ${row.unit_label}</td>
                <td>Slot ${row.slot}</td>
                <td>${row.display_name}</td>
                <td><span class="status-pill ${statusClass}">${row.status}</span></td>
            </tr>
        `;
    }).join('');
}

function renderUsersTable(users) {
    const tbody = document.getElementById('users-tbody');
    
    tbody.innerHTML = users.map(user => {
        // Format the date (e.g., Jan 24, 2024)
        const date = new Date(user.created_at).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        // Use the public unitMapping for the letter
        const unitLetter = unitMapping[user.device_uuid] || '?';

        return `
            <tr>
                <td>${date}</td>
                <td style="font-weight: bold;">Unit ${unitLetter}</td>
                <td>${user.name}</td>
                <td>${user.contact}</td>
                <td>
                    <button class="btn-action" onclick="openEditModal('${user.id}', '${user.name}', '${user.contact}')">Edit</button>
                    <button class="btn-action" style="color:red;" onclick="openDeleteModal('${user.id}')">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderLogsTable(logs) {
    const tbody = document.getElementById('logs-tbody');
    
    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No completed sessions found.</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(row => {
        const unitLetter = unitMapping[row.device_uuid] || '?';
        const userName = row.registration ? row.registration.name : 'Unknown';

        // 1. Format the Main Date (e.g., 02/25/2026)
        const dateObj = new Date(row.created_at);
        const displayDate = dateObj.toLocaleDateString();

        // 2. Format the Times (e.g., 7:27 AM)
        const formatTime = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--';
        const timeInStr = formatTime(row.timein);
        const timeOutStr = formatTime(row.timeout);

        // 3. Calculate Total Duration in Minutes
        let totalMinutes = 0;
        if (row.timein && row.timeout) {
            const start = new Date(row.timein);
            const end = new Date(row.timeout);
            // Difference in ms / 1000 (seconds) / 60 (minutes)
            totalMinutes = Math.round((end - start) / 60000);
        }

        return `
            <tr>
                <td>${displayDate}</td>
                <td style="font-weight: bold;">Unit ${unitLetter}</td>
                <td>Slot ${row.slot}</td>
                <td>${userName}</td>
                <td>${row.user_id}</td>
                <td>${timeInStr}</td>
                <td>${timeOutStr}</td>
                <td style="font-weight: bold; color: #006adb;">${totalMinutes > 0 ? totalMinutes : 0} min</td>
            </tr>
        `;
    }).join('');
}
    // Helper: Match the "active" button text to the Panel ID
function switchPanel(label) {
    hideAllPanas();
    
    if (label === "View Racks") {
        document.getElementById('panel-view-racks').classList.add('active-panel');
        loadRackStatus(); // <--- This triggers the live data load
    } else if (label === "Manage Users") {
        document.getElementById('panel-manage-users').classList.add('active-panel');
        loadManageUsers();
    } else if (label === "Session Logs") {
        document.getElementById('panel-session-logs').classList.add('active-panel');
        loadSessionLogs();
    } else if (label === "Settings") {
        document.getElementById('panel-settings').classList.add('active-panel');
    }
}

    // Your existing Sidebar toggle function
    sidebarBtn.onclick = function () {
        document.getElementById('sidebar').classList.toggle('collapsed');
    }

    // 1. Open Edit Modal
async function openEditModal(userId, currentName, currentContact) {
    const modal = document.getElementById('modal-edit');
    
    // Fill the inputs
    document.getElementById('edit-name').value = currentName;
    document.getElementById('edit-contact').value = currentContact;
    
    // Show the overlay
    modal.style.display = 'flex';

    document.getElementById('save-edit-btn').onclick = async () => {
        const newName = document.getElementById('edit-name').value;
        const newContact = document.getElementById('edit-contact').value;

        const { error } = await client
            .from('registration')
            .update({ name: newName, contact: newContact })
            .eq('id', userId);

        if (error) {
            alert("Update failed: " + error.message);
        } else {
            closeModals();
            loadManageUsers(); // Refresh the table
        }
    };
}

// 2. Open Delete Modal (Simplified)
function openDeleteModal(userId) {
    const modal = document.getElementById('modal-confirm');
    document.getElementById('confirm-title').innerText = "Delete User";
    document.getElementById('confirm-msg').innerText = "Are you sure? This cannot be undone.";
    
    modal.style.display = 'flex';
    
    document.getElementById('confirm-yes-btn').onclick = async () => {
        // Instead of .delete(), we use .update()
        const { error } = await client
            .from('registration')
            .update({ status: -1 }) // Set status to -1 (soft delete)
            .eq('id', userId);

        if (error) {
            alert("Error: " + error.message);
        } else {
            console.log("User moved to inactive/deleted status.");
            closeModals();
            loadManageUsers(); // This will refresh the table and the user will disappear
        }
    };
}

// 3. Global Close
function closeModals() {
    document.getElementById('modal-edit').style.display = 'none';
    document.getElementById('modal-confirm').style.display = 'none';
    document.getElementById('modal-verify').style.display = 'none';
}
// 3. Open Logout (Reusing Confirm Modal)
document.querySelector('.logout-btn').onclick = () => {
    const modal = document.getElementById('modal-confirm');
    document.getElementById('confirm-title').innerText = "Logout";
    document.getElementById('confirm-msg').innerText = "Are you sure you want to logout?";
    
    modal.style.display = 'flex';
    
    document.getElementById('confirm-yes-btn').onclick = () => {
        window.location.href = "index.html"; // Or your logout logic
    };
};

// Function to initialize Realtime listeners
function initRealtime() {
    client
    .channel('device-status')
    .on(
        'postgres_changes',
        {
            event: 'UPDATE',
            schema: 'public',
            table: 'device_unit',
            filter: `admin_id=eq.${adminId}`
        },
        (payload) => {
            console.log('Device status changed!', payload);
            // Refresh the dashboard stats if we are on the dashboard
            if (document.getElementById('panel-default').classList.contains('active-panel')) {
                loadDashboardStats();
            }
        }
    )
    .subscribe();
    // 1. Listen for Rack Session changes (Live Rack Status)
    client
        .channel('schema-db-changes')
        .on(
            'postgres_changes',
            {
                event: '*', // Listen for ALL changes (Insert, Update, Delete)
                schema: 'public',
                table: 'rack_sessions'
            },
            (payload) => {
                console.log('Rack Change detected!', payload);
                // If the "View Racks" panel is currently active, refresh it
                if (document.getElementById('panel-view-racks').classList.contains('active-panel')) {
                    loadRackStatus();
                }
                // Also refresh logs if that panel is open
                if (document.getElementById('panel-session-logs').classList.contains('active-panel')) {
                    loadSessionLogs();
                }
            }
        )
        .subscribe();

    // 2. Listen for Registration changes (User Management)
    client
        .channel('user-changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'registration'
            },
            (payload) => {
                console.log('User change detected!', payload);
                if (document.getElementById('panel-manage-users').classList.contains('active-panel')) {
                    loadManageUsers();
                }
            }
        )
        .subscribe();
}
// Every 30 seconds, refresh the dashboard stats to ensure 
// "Online" units haven't timed out and become "Offline"
setInterval(() => {
    if (document.getElementById('panel-default').classList.contains('active-panel')) {
        loadDashboardStats();
    }
}, 30000);
// Start the listeners!
initRealtime();
