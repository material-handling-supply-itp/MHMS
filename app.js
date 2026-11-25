(() => {
"use strict";
const API=(window.MHMS_CONFIG?.API_BASE_URL||"").replace(/\/$/,"");
const SESSION_KEY="mhms_session";
const ROLES=["Section Head","Staff","Foreman","Leader","Admin","Worker","Other"];
const AREAS=["Material Handling","Coal","Material","Truck Scale","Mechanic","Elektrik","Mechanic & Elektrik","Inspeksi","Cleaner","Fuel","Administrasi","Other"];
const $=id=>document.getElementById(id);
let currentUser=null, usersCache=[], editingUser=null, selectedResetUser=null, forcePasswordChange=false;

async function callApi(action,payload={}) {
  if(!API) throw Error("API_BASE_URL belum diatur di config.js.");
  const response=await fetch(API+"/api",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...payload})});
  if(!response.ok) throw Error("Koneksi API gagal ("+response.status+").");
  const result=await response.json();
  if(!result.ok) throw Error(result.message||"Permintaan gagal.");
  return result.data;
}
const token=()=>sessionStorage.getItem(SESSION_KEY);
const isAdmin=user=>String(user?.role||"").trim().toLowerCase()==="admin";
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2800);}
function fillSelect(id,items,placeholder){const el=$(id);el.innerHTML=`<option value="">${placeholder}</option>`+items.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");}
function showLogin(message=""){$("appView").classList.add("hidden");$("loginView").classList.remove("hidden");$("loginMessage").textContent=message;}
function showPage(page){if(page==="users"&&!isAdmin(currentUser))return; $("dashboardPage").classList.toggle("hidden",page!=="dashboard");$("usersPage").classList.toggle("hidden",page!=="users");document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));if(page==="users")loadUsers();}
function setUser(user){currentUser=user;$("userLabel").textContent=user.name||"Pengguna";$("roleLabel").textContent=user.role||"USER";$("userInitial").textContent=(user.name||"U").charAt(0).toUpperCase();$("welcomeName").textContent=user.name||"Pengguna";$("welcomeMeta").textContent=`NIK: ${user.nik||"-"}  ·  Area: ${user.area||"-"}`;$("usersNav").classList.toggle("hidden",!isAdmin(user));}
async function loadDashboard(){
  const data=await callApi("dashboard",{token:token()});
  setUser(data.user);
  $("totalReports").textContent=data.summary?.totalReports??0;
  $("activeWos").textContent=data.summary?.activeWorkOrders??0;
  $("openItems").textContent=data.summary?.openItems??0;
  $("todayLabel").textContent=new Intl.DateTimeFormat("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date());
  $("loginView").classList.add("hidden");$("appView").classList.remove("hidden");showPage("dashboard");
  forcePasswordChange=!!data.user?.mustChangePassword;
  if(forcePasswordChange){$("changePasswordModal").classList.remove("hidden");$("currentPassword").focus();}
}
$("loginForm").addEventListener("submit",async e=>{
  e.preventDefault();const button=$("loginButton");button.disabled=true;$("loginMessage").textContent="Memeriksa NIK dan password...";
  const nik=$("nik").value.trim();
  if(!/^\d+$/.test(nik)){$("loginMessage").textContent="NIK hanya boleh berisi angka.";button.disabled=false;return;}
  try{const data=await callApi("login",{nik,password:$("password").value});sessionStorage.setItem(SESSION_KEY,data.token);$("password").value="";await loadDashboard();}
  catch(err){$("loginMessage").textContent=err.message;}
  finally{button.disabled=false;}
});
$("logoutButton").addEventListener("click",async()=>{try{await callApi("logout",{token:token()});}catch(_){}sessionStorage.removeItem(SESSION_KEY);currentUser=null;forcePasswordChange=false;showLogin();});
document.querySelectorAll(".nav-item").forEach(button=>button.addEventListener("click",()=>{if(forcePasswordChange)return toast("Ganti password terlebih dahulu.");showPage(button.dataset.page);}));

// Password change for first login or after admin reset
$("changePasswordForm").addEventListener("submit",async e=>{
  e.preventDefault();const next=$("newOwnPassword").value;
  if(next!==$("confirmOwnPassword").value){$("changePasswordMessage").textContent="Konfirmasi password tidak sama.";return;}
  if(next.length<8){$("changePasswordMessage").textContent="Password minimal 8 karakter.";return;}
  const button=$("saveOwnPassword");button.disabled=true;$("changePasswordMessage").textContent="Menyimpan password...";
  try{await callApi("change_password",{token:token(),currentPassword:$("currentPassword").value,newPassword:next});$("changePasswordModal").classList.add("hidden");$("changePasswordForm").reset();forcePasswordChange=false;toast("Password berhasil diperbarui.");}
  catch(err){$("changePasswordMessage").textContent=err.message;}
  finally{button.disabled=false;}
});

// User management
fillSelect("newRole",ROLES,"Pilih role");fillSelect("newArea",AREAS,"Pilih area");
$("roleFilter").innerHTML='<option value="">Semua Role</option>'+ROLES.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
function renderUsers(){
  const query=$("userSearch").value.trim().toLowerCase(),role=$("roleFilter").value;
  const filtered=usersCache.filter(u=>[u.name,u.nik,u.area,u.role].some(v=>String(v||"").toLowerCase().includes(query))&&(!role||u.role===role));
  $("userTotal").textContent=usersCache.length;$("userActive").textContent=usersCache.filter(u=>u.status==="ACTIVE").length;$("userInactive").textContent=usersCache.filter(u=>u.status!=="ACTIVE").length;
  $("tableCount").textContent=`${filtered.length} dari ${usersCache.length} pengguna`;
  if(!filtered.length){$("usersTableBody").innerHTML='<tr><td colspan="7" class="empty-state">Tidak ada pengguna yang sesuai.</td></tr>';return;}
  $("usersTableBody").innerHTML=filtered.map(u=>{
    const active=u.status==="ACTIVE",admin=String(u.role).toLowerCase()==="admin";
    return `<tr>
      <td><div class="person-cell"><span class="person-avatar">${esc((u.name||"U").charAt(0).toUpperCase())}</span><span><b>${esc(u.name)}</b><small>${esc(u.userId)}</small></span></div></td>
      <td class="nik-cell">${esc(u.nik)}</td><td><span class="role-pill ${admin?"role-admin":"role-user"}">${esc(u.role)}</span></td><td>${esc(u.area)}</td>
      <td><span class="status-pill ${active?"status-active":"status-inactive"}">${active?"AKTIF":"NONAKTIF"}</span></td>
      <td>${u.mustChangePassword?'<span class="password-pill">Wajib ganti</span>':'Normal'}</td>
      <td><div class="action-group"><button class="action-btn" data-action="edit" data-id="${esc(u.userId)}">Edit</button><button class="action-btn" data-action="reset" data-id="${esc(u.userId)}">Reset</button>${u.userId===currentUser?.userId?"":`<button class="action-btn ${active?"danger":""}" data-action="status" data-status="${active?"INACTIVE":"ACTIVE"}" data-id="${esc(u.userId)}">${active?"Nonaktifkan":"Aktifkan"}</button>`}</div></td>
    </tr>`;
  }).join("");
}
async function loadUsers(){
  if(!isAdmin(currentUser))return;
  $("usersTableBody").innerHTML='<tr><td colspan="7" class="empty-state">Memuat data pengguna...</td></tr>';
  try{const data=await callApi("list_users",{token:token()});usersCache=data.users||[];renderUsers();}
  catch(err){$("usersTableBody").innerHTML=`<tr><td colspan="7" class="empty-state">${esc(err.message)}</td></tr>`;}
}
$("userSearch").addEventListener("input",renderUsers);$("roleFilter").addEventListener("change",renderUsers);$("refreshUsers").addEventListener("click",loadUsers);
function openUser(user=null){
  editingUser=user;$("userForm").reset();$("userFormMessage").textContent="";
  $("userModalTitle").textContent=user?"Edit Pengguna":"Tambah Pengguna";
  $("saveUserButton").textContent=user?"Simpan Perubahan":"Buat Akun";
  $("newName").value=user?.name||"";$("newNik").value=user?.nik||"";$("newRole").value=user?.role||"";$("newArea").value=user?.area||"";
  $("passwordCreateGroup").classList.toggle("hidden",!!user);$("newPassword").required=!user;
  $("userModal").classList.remove("hidden");
}
function closeUser(){$("userModal").classList.add("hidden");editingUser=null;}
$("addUserButton").addEventListener("click",()=>openUser());$("closeModal").addEventListener("click",closeUser);$("cancelModal").addEventListener("click",closeUser);
$("userForm").addEventListener("submit",async e=>{
  e.preventDefault();const button=$("saveUserButton");button.disabled=true;$("userFormMessage").textContent="Menyimpan data...";
  const user={name:$("newName").value.trim(),nik:$("newNik").value.trim(),role:$("newRole").value,area:$("newArea").value};
  if(!/^\d+$/.test(user.nik)){$("userFormMessage").textContent="NIK hanya boleh berisi angka.";button.disabled=false;return;}
  try{
    if(editingUser){await callApi("edit_user",{token:token(),userId:editingUser.userId,user});}
    else{user.password=$("newPassword").value;await callApi("create_user",{token:token(),user});}
    closeUser();await loadUsers();toast(editingUser?"Data pengguna diperbarui.":"Akun pengguna berhasil dibuat.");
  }catch(err){$("userFormMessage").textContent=err.message;}
  finally{button.disabled=false;}
});
function openReset(user){selectedResetUser=user;$("resetForm").reset();$("resetMessage").textContent="";$("resetUserName").textContent=`${user.name} · NIK ${user.nik}`;$("resetModal").classList.remove("hidden");}
function closeReset(){$("resetModal").classList.add("hidden");selectedResetUser=null;}
$("closeResetModal").addEventListener("click",closeReset);$("cancelReset").addEventListener("click",closeReset);
$("resetForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!selectedResetUser)return;const button=$("confirmReset");button.disabled=true;$("resetMessage").textContent="Memproses...";
  try{await callApi("reset_user_password",{token:token(),userId:selectedResetUser.userId,newPassword:$("resetPassword").value});closeReset();await loadUsers();toast("Password berhasil direset. Pengguna wajib mengganti password saat login.");}
  catch(err){$("resetMessage").textContent=err.message;}
  finally{button.disabled=false;}
});
$("usersTableBody").addEventListener("click",async e=>{
  const button=e.target.closest("button[data-action]");if(!button)return;
  const user=usersCache.find(u=>u.userId===button.dataset.id);if(!user)return;
  if(button.dataset.action==="edit")return openUser(user);
  if(button.dataset.action==="reset")return openReset(user);
  const status=button.dataset.status;if(!confirm(`${status==="INACTIVE"?"Nonaktifkan":"Aktifkan kembali"} akun ${user.name}?`))return;
  button.disabled=true;
  try{await callApi("update_user_status",{token:token(),userId:user.userId,status});await loadUsers();toast("Status akun diperbarui.");}
  catch(err){toast(err.message);button.disabled=false;}
});
async function restore(){
  if(!token())return showLogin();
  try{await loadDashboard();}
  catch(err){sessionStorage.removeItem(SESSION_KEY);showLogin("Sesi berakhir. Silakan login kembali.");}
}
restore();
})();
