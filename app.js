// --- CONFIGURATION SUPABASE ---
const SUPABASE_URL = 'https://qcdxsafopgihmdwudayb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_sSgPsSwF436uHqtqgF9ytw_RKqqwIjt';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const authForm = document.getElementById('auth-form');
const usernameInput = document.getElementById('username');
const submitBtn = authForm.querySelector('button[type="submit"]') || authForm.querySelector('button');
const myIdSpan = document.getElementById('my-id');
const userBadge = document.getElementById('user-badge');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const batteryText = document.getElementById('battery-text');

let map = null;
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

// Inscription sécurisée et instantanée
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = usernameInput.value.trim();
  if (!name) return;

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Inscription en cours...";
  }

  // 1. Insertion directe dans Supabase avec des coordonnées par défaut (Abidjan)
  // pour éviter tout blocage lié au GPS du téléphone au premier clic.
  const { data, error } = await supabase
    .from('family_users')
    .insert([{ name: name, latitude: 5.3600, longitude: -4.0083, battery_level: 100 }])
    .select().single();

  if (error) {
    alert("Erreur d'enregistrement : " + error.message);
    resetSubmitButton();
    return;
  }

  myUserId = data.id;
  myUserName = data.name;
  localStorage.setItem('family_user_id', myUserId);
  localStorage.setItem('family_user_name', myUserName);

  // 2. Basculement immédiat de l'écran
  lancerApplication(myUserId);
});

function resetSubmitButton() {
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Obtenir mon ID & Démarrer";
  }
}

function lancerApplication(userId) {
  authScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  if (userBadge) userBadge.classList.remove('hidden');
  if (myIdSpan) myIdSpan.textContent = userId;

  // Petit délai pour laisser le DOM afficher l'écran de la carte avant d'initialiser Leaflet
  setTimeout(() => {
    initialiserCarte();
    demarrerBaliseGPSAutomatique(userId);
  }, 100);
}

function initialiserCarte() {
  if (map) return;
  // S'assure que la div map a bien une hauteur visible
  const mapDiv = document.getElementById('map');
  if (mapDiv && mapDiv.clientHeight === 0) {
    mapDiv.style.height = '70vh';
  }

  map = L.map('map').setView([5.3600, -4.0083], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
}

// Récupération de la batterie
async function obtenirBatterie() {
  if ('getBattery' in navigator) {
    try {
      const battery = await navigator.getBattery();
      return Math.round(battery.level * 100);
    } catch (e) {
      return null;
    }
  }
  return null;
}

// Balise GPS automatique en arrière-plan
function demarrerBaliseGPSAutomatique(userId) {
  if (!("geolocation" in navigator)) {
    if (statusText) statusText.textContent = "❌ GPS non supporté par l'appareil";
    return;
  }

  navigator.geolocation.watchPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const battery = await obtenirBatterie();

      if (statusDot) statusDot.className = "w-3 h-3 rounded-full bg-green-500";
      if (statusText) statusText.textContent = "🟢 Balise active (GPS connecté)";
      if (batteryText && battery !== null) batteryText.textContent = `🔋 ${battery}%`;

      // Met à jour la position réelle sur la carte si elle est initialisée
      if (map) {
        const latLng = [lat, lng];
        if (markers['me']) {
          markers['me'].setLatLng(latLng);
        } else {
          markers['me'] = L.marker(latLng).addTo(map).bindPopup("<b>Moi</b><br>Ma position GPS").openPopup();
          map.setView(latLng, 15);
        }
      }

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
      if (statusDot) statusDot.className = "w-3 h-3 rounded-full bg-red-500";
      if (statusText) statusText.textContent = "⚠️ Signal GPS coupé ou indisponible";
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

// Observer un ami en entrant son ID
async function observerAmi() {
  const targetIdInput = document.getElementById('target-id');
  if (!targetIdInput) return;
  
  const targetId = targetIdInput.value.trim();
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
