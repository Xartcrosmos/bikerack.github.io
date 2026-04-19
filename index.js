const SUPABASE_URL = "https://lguyiavotyrxdlyhsvmz.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxndXlpYXZvdHlyeGRseWhzdm16Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNzQ0MjQsImV4cCI6MjA4NDc1MDQyNH0.f1hT0B68mv2lxVsQldk3ABx_0yBBUK2t1fcRHWGhmyM";
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const msgELV = document.getElementById("Vmsg");
const msgELS = document.getElementById("Smsg");
const infoEl = document.getElementById("info");
const visitorActions = document.getElementById("visitorActions");
const slotActions = document.getElementById("slotActions");
let heartbeat = null, loginPollTimer = null, sessionId = null, sessionKey = null, currentDevice = null, currentSlot = null;

const sidebar = document.getElementById('right-sidebar');
const toggleBtn = document.getElementById('sidebar-toggle-btn');

const now = () => Math.floor(Date.now()/1000);
const showError = async (m) => {
  await showToast(m, "error");
  // We remove window.location.reload() from here
  msgELS.textContent = m;
  msgELS.className = "error";
  window.location.reload();
};
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

window.addEventListener("load", async () => {
  const params = new URLSearchParams(location.search);
  currentDevice = params.get("device");
  currentSlot = parseInt(params.get("slot"), 10);

  if (!currentDevice || Number.isNaN(currentSlot)) {
    msgELV.textContent = "Welcome! Please scan a QR code to use a slot.";
    visitorActions.classList.remove("hidden");
    return;
  }

  visitorActions.classList.add("hidden");
  document.querySelector("#slotActions #info").textContent = `Slot #${currentSlot}`;

  // 1. Initial cleanup
  await client.from("rack_sessions").delete().eq("device_uuid", currentDevice).eq("slot", currentSlot).eq("status", 0);

  // 2. Check Device Status
  const { data: unit } = await client.from("device_unit").select("status").eq("uuid", currentDevice).maybeSingle();
  if (!unit || unit.status !== "claimed") {
    return await showError("This device is not activated. Please contact admin.");
  }

  // 3. Check Physical Occupancy
  const { data: rack } = await client.from("rack_sessions").select("status").eq("device_uuid", currentDevice).eq("slot", currentSlot).eq("status", 1).maybeSingle();
  if (rack) {
    return await showError("Slot is physically occupied.");
  }

  sessionKey = `session_${currentDevice}_${currentSlot}`;
  sessionId = localStorage.getItem(sessionKey) || crypto.randomUUID();

  // 4. Check Active Digital Session
  const { data: active } = await client.from("sessions").select("session_id").eq("device_uuid", currentDevice).eq("slot", currentSlot).gt("last_seen", now() - 60).maybeSingle();
  if (active && active.session_id !== sessionId) {
    return await showError("Slot is in use by another user.");
  }

  // 5. Upsert Session
  const { error: upsertErr } = await client.from("sessions").upsert([{ device_uuid: currentDevice, slot: currentSlot, session_id: sessionId, last_seen: now() }], { onConflict: 'device_uuid, slot' });
  if (upsertErr) {
    return await showError("Could not start session.");
  }

  localStorage.setItem(sessionKey, sessionId);
  slotActions.classList.remove("hidden");
  msgELS.textContent = `Rack Ready - Slot ${currentSlot}`;
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
  localStorage.setItem("admin_id",data.id); location.href = `admin.html?id=${data.id}`;
};

function showToast(message, type = 'info') {
  return new Promise((resolve) => {
    const toast = document.getElementById("toast");
    const msgEl = document.getElementById("toast-message");
    const btn = document.getElementById("toast-btn");

    msgEl.textContent = message;
    toast.className = `toast show ${type}`;

    // This function runs only when the button is clicked
    btn.onclick = () => {
      toast.classList.remove("show");
      // Delay resolve slightly so the animation finishes
      setTimeout(resolve, 300); 
    };
  });
}

// Replace the old pollLogin function with this
let realtimeChannel = null;

const subscribeToLogin = (rowId) => {
  // Clean up any existing channel
  if (realtimeChannel) client.removeChannel(realtimeChannel);

  realtimeChannel = client
    .channel('public:rack_sessions')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'rack_sessions',
        filter: `id=eq.${rowId}`
      },
      async (payload) => {
        const data = payload.new;
        
        // Status 0: Still waiting (no action needed)
        if (data.status === 0) return;

        if (data.status === 5) {
          msgELS.textContent = "Scanning...";
          return; // Wait for the next update (1 or 2)
        }

        // Status 1: Success!
        if (data.status === 1) {
          // Unsubscribe immediately so we don't trigger twice
          client.removeChannel(realtimeChannel);
          
          const userId = data.user_id;

          // --- SECURITY CHECK (Same as your original logic) ---
          const { data: userReg } = await client.from("registration").select("admin_id").eq("id", userId).maybeSingle();
          
          if (!userReg || !userReg.admin_id) {
            await showToast("No valid registration found.", "error"); 
            
            // 2. ONLY UPDATE TO 0 AFTER CLICK
            await client.from("rack_sessions").update({ status: 0 }).eq("id", rowId);
            msgELS.textContent = "Please scan fingerprint...";
            return;
          }

          const { data: ownedUnit } = await client.from("device_unit")
            .select("uuid")
            .eq("admin_id", userReg.admin_id)
            .eq("uuid", currentDevice)
            .maybeSingle();

          if (!ownedUnit) {
            await showToast("Not registered to this unit.", "error");
            
            await client.from("rack_sessions").update({ status: 0 }).eq("id", rowId);
            msgELS.textContent = "Please scan fingerprint...";
            return;
          }
          // --- END SECURITY CHECK ---

          // Finalize session
          await client.from("sessions").update({ user_id: userId }).eq("session_id", sessionId);
          await client.from("rack_sessions").update({ timein: new Date().toISOString() }).eq("id", rowId); 
          
          localStorage.setItem("session_data", JSON.stringify({ currentDevice, currentSlot, userId, dbRowId: rowId }));
          window.location.href = `login.html?device=${currentDevice}&slot=${currentSlot}&id=${userId}`;
        } 
        
        // Status 2: Recognition Failed
        else if (data.status === 2) {
          await showToast("Fingerprint not recognized.", "error");

          await client.from("rack_sessions").update({ status: 0 }).eq("id", rowId);
          msgELS.textContent = "Please scan fingerprint...";
        }
      }
    )
    .subscribe();
};

// Update your Login Button handler
loginUserBtn.onclick = async () => {
  loginUserBtn.disabled = true;
  registerBtn.disabled = true;
  
  const { data: deviceData } = await client.from("device_unit").select("admin_id").eq("uuid", currentDevice).single();
  
  if (!deviceData) {
    loginUserBtn.disabled = false;
    registerBtn.disabled = false;
    return showError("Device not found.");
  }

  msgELS.textContent = "Please scan fingerprint...";

  const { data, error } = await client.from("rack_sessions")
    .insert([{ 
      device_uuid: currentDevice, 
      slot: currentSlot, 
      status: 0, 
      admin_id: deviceData.admin_id 
    }])
    .select()
    .single();

  if (error) {
    loginUserBtn.disabled = false;
    registerBtn.disabled = false;
    return showError(error.message);
  }

  // Instead of pollLogin(data.id), use the subscriber
  subscribeToLogin(data.id);
};
/* ========= REGISTER BUTTON HANDLER (SLOT MODE) ========= */
registerBtn.onclick = () => {
  window.location.href = `register.html?device=${currentDevice}&slot=${currentSlot}`;
};

document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopHeartbeat();
  else if (sessionId && !slotActions.classList.contains("hidden")) startHeartbeat();
});
