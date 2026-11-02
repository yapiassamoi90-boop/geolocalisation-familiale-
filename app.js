// --- CONSOLE DE DEBUG VISIBLE SUR MOBILE ---
const logBox = document.createElement('div');
logBox.style.cssText = "position:fixed; bottom:0; left:0; width:100%; height:120px; background:rgba(0,0,0,0.9); color:#00ff00; font-size:11px; z-index:999999; overflow-y:auto; padding:8px; font-family:monospace;";
logBox.innerHTML = "<b>[DEBUG ACTIF]</b><br>";
window.addEventListener('DOMContentLoaded', () => document.body.appendChild(logBox));

function logMsg(txt, isError = false) {
  if (logBox) {
    logBox.innerHTML += `<span style="color:${isError ? 'red' : '#fff'}">> ${txt}</span><br>`;
    logBox.scrollTop = logBox.scrollHeight;
  }
}

// --- CONFIGURATION SUPABASE ---
const SUPABASE_URL = 'https://qcdxsafopgihmdwudayb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_sSgPsSwF436uHqtqgF9ytw_RKqqwIjt';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const authForm = document.getElementById('auth-form');
const usernameInput = document.getElementById('username');
const myIdSpan = document.getElementById('my-id');
const userBadge = document.getElementById('user-badge');

let map = null;
let markers = {};
let myUserId = localStorage.getItem('family_user_id');
let myUserName = localStorage.getItem('family_user_name');

window.addEventListener('DOMContentLoaded', () => {
  logMsg("DOM chargé. User ID stocké: " + myUserId);
  if (myUserId && myUserName) lancerApplication(myUserId);
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  logMsg("Formulaire intercepté !");

  const name = usernameInput.value.trim();
  if (!name) {
    alert("Tape ton nom");
    return;
  }

  const btn = authForm.querySelector('button');
  btn.disabled = true;
  btn.textContent = "Patiente...";

  try {
    logMsg("Tentative d'insertion Supabase pour: " + name);
    const { data, error } = await supabase
      .from('family_users')
      .insert([{ name: name, latitude: 5.3600, longitude: -4.0083 }])
      .select()
      .single();

    if (error) throw error;
    
    logMsg("Succès ! ID attribué: " + data.id);
    localStorage.setItem('family_user_id', data.id);
    localStorage.setItem('family_user_name', data.name);
    lancerApplication(data.id);

  } catch (err) {
    logMsg("ERREUR: " + err.message, true);
    alert("Erreur: " + err.message);
    btn.disabled = false;
    btn.textContent = "Obtenir mon ID & Démarrer";
  }
});

function lancerApplication(userId) {
  logMsg("Lancement application pour ID: " + userId);
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  userBadge.classList.remove('hidden');
  myIdSpan.textContent = userId;

  setTimeout(() => {
    if (!map) {
      logMsg("Initialisation de la carte Leaflet...");
      map = L.map('map').setView([5.3600, -4.0083], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    }
    
    navigator.geolocation.watchPosition((pos) => {
      const latLng = [pos.coords.latitude, pos.coords.longitude];
      logMsg(`GPS mis à jour: ${latLng[0].toFixed(4)}, ${latLng[1].toFixed(4)}`);
      if (markers['me']) markers['me'].setLatLng(latLng);
      else markers['me'] = L.marker(latLng).addTo(map).bindPopup("Moi").openPopup();
      map.setView(latLng, 15);
      
      supabase.from('family_users')
        .update({ latitude: latLng[0], longitude: latLng[1] })
        .eq('id', userId)
        .then(() => {});
    }, (err) => {
      logMsg("Erreur GPS watch: " + err.message, true);
    }, { enableHighAccuracy: true });
  }, 200);
}

async function observerAmi() {
  const targetId = document.getElementById('target-id').value.trim();
  if (!targetId) return alert("ID vide");
  const { data, error } = await supabase.from('family_users').select('*').eq('id', targetId).single();
  if (error || !data) return alert("ID introuvable");
  const latLng = [data.latitude, data.longitude];
  if (markers[data.id]) markers[data.id].setLatLng(latLng);
  else markers[data.id] = L.marker(latLng).addTo(map).bindPopup(data.name).openPopup();
  map.setView(latLng, 15);
}
