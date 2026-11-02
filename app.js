const SUPABASE_URL = 'https://qcdxsafopgihmdwudayb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_sSgPsSwF436uHqtqgF9ytw_RKqqwIjt';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const authForm = document.getElementById('auth-form');
const usernameInput = document.getElementById('username');
const myIdSpan = document.getElementById('my-id');
const userBadge = document.getElementById('user-badge');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

let map = null;
let markers = {};
let myUserId = localStorage.getItem('family_user_id');
let myUserName = localStorage.getItem('family_user_name');

window.addEventListener('DOMContentLoaded', () => {
  if (myUserId && myUserName) lancerApplication(myUserId);
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = usernameInput.value.trim();
  if (!name) return alert("Tape ton nom");

  const btn = authForm.querySelector('button');
  btn.disabled = true;
  btn.textContent = "Patiente...";

  try {
    const { data, error } = await supabase.from('family_users').insert([{ name: name, latitude: 5.3600, longitude: -4.0083 }]).select().single();
    if (error) throw error;
    localStorage.setItem('family_user_id', data.id);
    localStorage.setItem('family_user_name', data.name);
    lancerApplication(data.id);
  } catch (err) {
    alert("Erreur Supabase: " + err.message);
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
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
    }
    if ("geolocation" in navigator) {
      navigator.geolocation.watchPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const latLng = [lat, lng];
        if (statusDot) statusDot.className = "w-3 h-3 rounded-full bg-green-500";
        if (statusText) statusText.textContent = "🟢 Balise active";
        if (markers['me']) markers['me'].setLatLng(latLng);
        else markers['me'] = L.marker(latLng).addTo(map).bindPopup("Moi").openPopup();
        map.setView(latLng, 15);
        supabase.from('family_users').update({ latitude: lat, longitude: lng }).eq('id', userId).then(()=>{});
      }, (err) => {
        if (statusText) statusText.textContent = "⚠️ GPS refusé: active la localisation";
        if (statusDot) statusDot.className = "w-3 h-3 rounded-full bg-red-500";
      }, { enableHighAccuracy: true });
    }
  }, 300);
}

async function observerAmi() {
  const targetId = document.getElementById('target-id').value.trim();
  if (!targetId) return alert("Entre un ID");
  const { data, error } = await supabase.from('family_users').select('*').eq('id', targetId).single();
  if (error || !data) return alert("ID introuvable");
  if (!data.latitude) return alert("Pas encore de GPS pour cet ID");
  const latLng = [data.latitude, data.longitude];
  if (markers[data.id]) markers[data.id].setLatLng(latLng);
  else markers[data.id] = L.marker(latLng).addTo(map).bindPopup(`<b>${data.name} (ID:${data.id})</b>`).openPopup();
  map.setView(latLng, 15);
}
