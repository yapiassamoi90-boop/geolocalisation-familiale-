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
const jsStatus = document.getElementById('js-status');

let map = null;
let markers = {};
let myUserId = localStorage.getItem('family_user_id');
let myUserName = localStorage.getItem('family_user_name');

// Confirmation visuelle que le fichier app.js s'est bien chargé
window.addEventListener('DOMContentLoaded', () => {
  if (jsStatus) {
    jsStatus.textContent = "✅ Script chargé avec succès !";
    jsStatus.className = "mb-4 text-xs font-semibold text-green-600 bg-green-50 p-2 rounded-lg border border-green-200";
  }

  if (myUserId && myUserName) {
    lancerApplication(myUserId);
  }
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = usernameInput.value.trim();
  if (!name) return alert("Tape ton nom");

  const btn = authForm.querySelector('button');
  btn.disabled = true;
  btn.textContent = "Patiente...";

  try {
    const { data, error } = await supabase
      .from('family_users')
      .insert([{ name: name, latitude: 5.3600, longitude: -4.0083 }])
      .select()
      .single();
      
    if (error) throw error;
    
    localStorage.setItem('family_user_id', data.id);
    localStorage.setItem('family_user_name', data.name);
    lancerApplication(data.id);
  } catch (err) {
    alert("Erreur: " + err.message);
    btn.disabled = false;
    btn.textContent = "Obtenir mon ID & Démarrer";
  }
});

function lancerApplication(userId) {
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  userBadge.classList.remove('hidden');
  myIdSpan.textContent = userId;

  setTimeout(() => {
    if (!map) {
      map = L.map('map').setView([5.3600, -4.0083], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    }
    
    navigator.geolocation.watchPosition((pos) => {
      const latLng = [pos.coords.latitude, pos.coords.longitude];
      if (markers['me']) markers['me'].setLatLng(latLng);
      else markers['me'] = L.marker(latLng).addTo(map).bindPopup("Moi").openPopup();
      map.setView(latLng, 15);
      
      supabase.from('family_users')
        .update({ latitude: latLng[0], longitude: latLng[1] })
        .eq('id', userId)
        .then(() => {});
    }, (err) => {
      console.error("GPS erreur:", err);
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
