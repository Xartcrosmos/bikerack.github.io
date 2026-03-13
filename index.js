const SUPABASE_URL = "https://lguyiavotyrxdlyhsvmz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxndXlpYXZvdHlyeGRseWhzdm16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNzQ0MjQsImV4cCI6MjA4NDc1MDQyNH0.f1hT0B68mv2lxVsQldk3ABx_0yBBUK2t1fcRHWGhmyM";
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const messageEl = document.getElementById("message");
const infoEl = document.getElementById("info");
const visitorActions = document.getElementById("visitorActions");
const slotActions = document.getElementById("slotActions");
let heartbeat = null, loginPollTimer = null, sessionId = null, sessionKey = null, currentDevice = null, currentSlot = null;

const sidebar = document.getElementById('right-sidebar');
const toggleBtn = document.getElementById('sidebar-toggle-btn');

const now = () => Math.floor(Date.now()/1000);
const showError = (m)=>{messageEl.textContent=m;messageEl.className="error";};
const stopHeartbeat = ()=>{ if(heartbeat) clearInterval(heartbeat); };

function openModal(id){document.getElementById(id).classList.remove("hidden");}
function closeModal(id){document.getElementById(id).classList.add("hidden");}
function showMsg(text,isErr){
  const el=document.querySelector('.modal:not(.hidden) .modal-msg');
  if(el){ el.textContent=text; el.className='modal-msg '+(isErr?'error':'muted'); }
}

const runHeartbeat = async () => {
  if(!sessionId) return;
  await client.from("sessions").update({ last_seen: now() }).eq("session_id", sessionId);
};

const startHeartbeat = () => { stopHeartbeat(); runHeartbeat(); heartbeat = setInterval(runHeartbeat, 15000); };

window.addEventListener("load", async ()=>{
  const params = new URLSearchParams(location.search);
  currentDevice = params.get("device");
  currentSlot = parseInt(params.get("slot"), 10);

  if(!currentDevice || Number.isNaN(currentSlot)){
    messageEl.textContent = "Welcome! Please scan a QR code to use a slot.";
    
    visitorActions.classList.remove("hidden");
    return;
  }

  visitorActions.classList.add("hidden");
  document.querySelector("#slotActions #info").textContent = `Slot #${currentSlot}`;

  await client
    .from("rack_sessions")
    .delete()
    .eq("device_uuid", currentDevice)
    .eq("slot", currentSlot)
    .eq("status", 0);

  const { data: unit } = await client.from("device_unit").select("status").eq("uuid", currentDevice).maybeSingle();
  if (!unit || unit.status !== "claimed") return showError("This device is not activated. Please contact admin.");

  const { data: rack } = await client.from("rack_sessions").select("status").eq("device_uuid", currentDevice).eq("slot", currentSlot).eq("status", 1).maybeSingle();
  if (rack) return showError("Slot is physically occupied.");

  sessionKey = `session_${currentDevice}_${currentSlot}`;
  sessionId = localStorage.getItem(sessionKey) || crypto.randomUUID();

  const { data: active } = await client.from("sessions").select("session_id").eq("device_uuid", currentDevice).eq("slot", currentSlot).gt("last_seen", now() - 60).maybeSingle();
  if (active && active.session_id !== sessionId) return showError("Slot is in use by another user.");

  const { error: upsertErr } = await client.from("sessions").upsert([{ device_uuid: currentDevice, slot: currentSlot, session_id: sessionId, last_seen: now() }], { onConflict: 'device_uuid, slot' });
  if (upsertErr) return showError("Could not start session.");

  localStorage.setItem(sessionKey, sessionId);
  slotActions.classList.remove("hidden");
  messageEl.textContent = `Rack Ready - Slot ${currentSlot}`;
  startHeartbeat();
});

visitorLoginBtn.onclick=()=>openModal("loginModal");
claimLink.onclick=()=>openModal("claimModal");
cancelClaim.onclick=()=>closeModal("claimModal");
cancelCreate.onclick=()=>closeModal("createModal");
cancelLogin.onclick=()=>closeModal("loginModal");

claimBtn.onclick=async()=>{
  const uuid=uuidInput.value.trim(), otc=otcInput.value.trim();
  if(!uuid||!otc) return showMsg("Enter UUID and OTC",true);
  const {data}=await client.from("device_unit").select("*").eq("uuid",uuid).eq("otc",otc).maybeSingle();
  if(!data) return showMsg("Invalid device",true);
  if(data.status==="claimed") return showMsg("Already claimed",true);
  window._claimUUID=uuid; closeModal("claimModal"); openModal("createModal");
};

createBtn.onclick=async()=>{
  const email=emailInput.value.trim(), pass=passInput.value.trim();
  if(!email||!pass) return showMsg("Enter email and password",true);
  const {data:existing}=await client.from("admins").select("*").eq("email",email).maybeSingle();
  if(existing){
    if(existing.password_hash!==pass) return showMsg("Email already linked. Use SAME password.",true);
    await linkDevice(existing.id,email,pass); return;
  }
  const {error}=await client.auth.signInWithOtp({ email, options:{shouldCreateUser:true} });
  if(error) return showMsg("Failed sending OTP",true);
  window._pendingCreate={email,pass}; closeModal("createModal"); openModal("otpModal");
};

otpVerifyBtn.onclick=async()=>{
  const code=otpInput.value.trim();
  const {email,pass}=window._pendingCreate||{};
  const {error}=await client.auth.verifyOtp({ email, token:code, type:'email' });
  if(error) return showMsg("Invalid OTP",true);
  const {data:newAdmin}=await client.from("admins").insert([{email,password_hash:pass}]).select().single();
  await linkDevice(newAdmin.id,email,pass); closeModal("otpModal");
};

async function linkDevice(adminId,email,pass){
  await client.from("device_unit").update({status:"claimed",admin_id:adminId}).eq("uuid",window._claimUUID);
  openModal("loginModal"); loginEmail.value=email; loginPass.value=pass;
}

loginBtn.onclick=async()=>{
  const email=loginEmail.value.trim(), pass=loginPass.value.trim();
  const {data}=await client.from("admins").select("*").eq("email",email).eq("password_hash",pass).maybeSingle();
  if(!data) return showMsg("Invalid login",true);
  localStorage.setItem("admin_id",data.id); location.href = `admin/admin.html?id=${data.id}`;
};

loginUserBtn.onclick = async () => {
  loginUserBtn.disabled = true;
  registerBtn.disabled = true;
  const { data: deviceData, error: deviceError } = await client.from("device_unit").select("admin_id").eq("uuid", currentDevice).single();
  if (deviceError || !deviceData) {
    loginUserBtn.disabled = false;
    registerBtn.disabled = false;
    return showError(deviceError?.message || "Device configuration not found.");
  }
  messageEl.textContent = "Please scan fingerprint to login...";
  const { data, error } = await client.from("rack_sessions").insert([{ device_uuid: currentDevice, slot: currentSlot, status: 0, admin_id: deviceData.admin_id }]).select().single();
  if (error) {
    loginUserBtn.disabled = false;
    registerBtn.disabled = false;
    return showError(error.message);
  }
  pollLogin(data.id);
};


async function pollLogin(id){
  const { data } = await client.from("rack_sessions").select("status, user_id").eq("id", id).single();
  if(!data) return;
  if(data.status === 0) loginPollTimer = setTimeout(() => pollLogin(id), 2000);
  if(data.status === 1) {
    clearTimeout(loginPollTimer);
    const userId = data.user_id;
    // 1. Get the Admin ID linked to this User ID
    const { data: userReg } = await client .from("registration") .select("admin_id") .eq("id", userId) .maybeSingle();
      if (!userReg || !userReg.admin_id) {
        alert("No valid user registration found. Please register.");
        await client.from("rack_sessions").update({ status: 0 }).eq("id", id);
        pollLogin(id);
        return; 
      }
    // 2. Check if the CURRENT DEVICE UUID belongs to that Admin
    const { data: ownedUnit } = await client .from("device_unit") .select("uuid") .eq("admin_id", userReg.admin_id) .eq("uuid", currentDevice) .maybeSingle();
      if (!ownedUnit) {
        alert("You're not registered to this unit yet. Please register.");
         await client.from("rack_sessions").update({ status: 0 }).eq("id", id);
        pollLogin(id);
        return;
      }
    // --- END SECURITY CHECK ---
    const { error: updateError } = await client.from("rack_sessions") .update({ user_id: userId }) .eq("id", id);

    if (updateError) {
        console.error("Update failed:", updateError.message);
        alert("Database sync failed. Please try again.");
        return;
    }
    await client.from("sessions").update({ user_id: userId }).eq("session_id", sessionId);
    const { error: timeInError } = await client.from("rack_sessions").update({ timein: new Date().toISOString() }).eq("id", id); 
    if (timeInError) {console.error("Time-in update failed:", timeInError.message);}
    localStorage.setItem("session_data", JSON.stringify({ currentDevice, currentSlot, userId, dbRowId: id }));
    window.location.href = `login.html?device=${currentDevice}&slot=${currentSlot}&id=${userId}`;
    return;
  } else if(data.status === 2){ 
    alert("Fingerprint not recognized."); 
    await client.from("rack_sessions").update({ status: 0 }).eq("id", id); 
    pollLogin(id); 
  }
}
/* ========= REGISTER BUTTON HANDLER (SLOT MODE) ========= */
registerBtn.onclick = () => {
  window.location.href = `register.html?device=${currentDevice}&slot=${currentSlot}`;
};

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopHeartbeat();
  else if (sessionId && !slotActions.classList.contains("hidden")) startHeartbeat();
});
