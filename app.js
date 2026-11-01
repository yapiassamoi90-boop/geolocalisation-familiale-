// --- CONFIGURATION SUPABASE ---
const SUPABASE_URL = 'VOTRE_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'VOTRE_SUPABASE_ANON_KEY';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const authForm = document.getElementById('auth-form');
const usernameInput = document.getElementById('username');
const myIdSpan = document.getElementById('my-id');
const userBadge = document.getElementById('user-badge');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const batteryText = document.getElementById('battery-text');

let map;
let markers = {};
let activeSubscription = null;
let myUserId = localStorage.getItem('family_user_id');
let myUserName = localStorage.getItem('family_user_name');

// Vérification au chargement
window.addEventListener('DOMContentLoaded', () => {
  if (myUserId && myUserName) {
    lancerApplication(myUserId);
  }
  enregistrerServiceWorker();
});

// Enregistrement du Service Worker PWA
function enregistrerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('Service Worker enregistré :', reg.scope))
      .catch((err) => console.log('Échec SW :', err));
  }
}

// Inscription et attribution automatique de l'ID (1, 2, 3...)
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = usernameInput.value.trim();
  if (!name) return;

  const { data, error } = await supabase
    .from('family_users')
    .insert([{ name: name, latitude: 0, longitude: 0 }])
    .select().single();

  if (error) return alert("Erreur d'enregistrement : " + error.message);

  myUserId = data.id;
  myUserName = data.name;
  localStorage.setItem('family_user_id', myUserId);
  localStorage.setItem('family_user_name', myUserName);

  lancerApplication(myUserId);
});

function lancerApplication(userId) {
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  userBadge.classList.remove('hidden');
  myIdSpan.textContent = userId;

  initialiserCarte();
  demarrerBaliseGPSAutomatique(userId);
}

function initialiserCarte() {
  map = L.map('map').setView([5.3600, -4.0083], 13); // Abidjan par défaut
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
}

// Récupération de la batterie
async function obtenirBatterie() {
  if ('getBattery' in navigator) {
    const battery = await navigator.getBattery();
    return Math.round(battery.level * 100);
  }
  return null;
}

// Balise GPS automatique en arrière-plan
function demarrerBaliseGPSAutomatique(userId) {
  if (!("geolocation" in navigator)) {
    statusText.textContent = "❌ GPS non supporté par l'appareil";
    return;
  }

  navigator.geolocation.watchPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const battery = await obtenirBatterie();

      statusDot.className = "w-3 h-3 rounded-full bg-green-500";
      statusText.textContent = "🟢 Balise active (GPS connecté)";
      if (battery !== null) batteryText.textContent = `🔋 ${battery}%`;

      await supabase
        .from('family_users')
        .update({ 
          latitude: lat, 
          longitude: lng, 
          battery_level: battery,
          updated_at: new Date().toISOString() 
        })
        .eq('id', userId);
    },
    (err) => {
      statusDot.className = "w-3 h-3 rounded-full bg-red-500";
      statusText.textContent = "⚠️ Signal GPS coupé ou indisponible";
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

// Observer un ami en entrant son ID
async function observerAmi() {
  const targetId = document.getElementById('target-id').value.trim();
  if (!targetId) return alert("Veuillez saisir un ID valide");

  if (activeSubscription) supabase.removeChannel(activeSubscription);

  const { data, error } = await supabase
    .from('family_users')
    .select('*')
    .eq('id', targetId)
    .single();

  if (error || !data) return alert("Cet ID n'existe pas dans le système");

  afficherOuMettreAJourMarqueur(data);

  activeSubscription = supabase
    .channel(`suivi_${targetId}`)
    .on('postgres_changes', { 
      event: 'UPDATE', 
      schema: 'public', 
      table: 'family_users', 
      filter: `id=eq.${targetId}` 
    }, (payload) => {
      afficherOuMettreAJourMarqueur(payload.new);
    })
    .subscribe();
}

// Calcul du statut Actif / Inactif selon l'horodatage
function calculerStatut(updatedAt) {
  if (!updatedAt) return { label: 'Inconnu', color: '#6b7280' };

  const diffMinutes = (new Date() - new Date(updatedAt)) / (1000 * 60);

  if (diffMinutes < 2) {
    return { label: 'En ligne (Signal actif)', color: '#22c55e' };
  } else {
    const mins = Math.round(diffMinutes);
    return { label: `Hors ligne (Inactif depuis ${mins} min)`, color: '#ef4444' };
  }
}

function afficherOuMettreAJourMarqueur(user) {
  if (!user.latitude || !user.longitude || (user.latitude === 0 && user.longitude === 0)) {
    return alert("Aucune donnée GPS n'a encore été reçue pour cet ID.");
  }

  const latLng = [user.latitude, user.longitude];
  const statut = calculerStatut(user.updated_at);
  const infoBatterie = user.battery_level !== null ? `🔋 Batterie : <b>${user.battery_level}%</b><br>` : '';

  const popupHTML = `
    <div style="font-size: 13px; font-family: sans-serif;">
      <h3 style="margin: 0 0 4px 0; font-weight: bold; font-size: 14px;">
        <span style="color:${statut.color}">●</span> #${user.id} - ${user.name}
      </h3>
      Statut : <b style="color:${statut.color}">${statut.label}</b><br>
      ${infoBatterie}
      <small style="color: #6b7280;">Dev.Assamoi</small>
    </div>
  `;

  if (markers[user.id]) {
    markers[user.id].setLatLng(latLng);
    markers[user.id].setPopupContent(popupHTML);
  } else {
    markers[user.id] = L.marker(latLng).addTo(map).bindPopup(popupHTML).openPopup();
  }

  map.setView(latLng, 15);
}
