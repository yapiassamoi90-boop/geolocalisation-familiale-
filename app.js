
/* =========================================================
   FAMILLE GPS - Dev.Assamoi
   Supabase + Leaflet + Firebase Cloud Messaging
   GPS volontaire - Carte classique + Vue satellite
   Alertes aux membres qui désactivent leur partage GPS
   ========================================================= */

'use strict';

/* ================= CONFIGURATION ================= */

const SUPABASE_URL = 'https://qcdxsafopgihmdwudayb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_sSgPsSwF436uHqtqgF9ytw_RKqqwIjt';

const REFRESH_INTERVAL = 10000;

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBsIPIeReKjRaDsSMUWc4E1deGMfq6e5ZI",
  authDomain: "relais-celebrations-bot.firebaseapp.com",
  projectId: "relais-celebrations-bot",
  storageBucket: "relais-celebrations-bot.firebasestorage.app",
  messagingSenderId: "773823361651",
  appId: "1:773823361651:web:9bbb40ae3daa8d82397006"
};

const FIREBASE_VAPID_KEY =
  "BKBW_3EQ9spdbvNmuLdA3qgGCridzpHVPpGByjGnaB-OstumZwNKxXtTQjyD6zztvTGBsRxWFcR6kEHdp7IJjG8";

const GPS_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 5000,
  timeout: 20000
};

/* ================= VARIABLES ================= */

let db = null;
let currentUser = null;
let myProfile = null;

let map = null;
let markers = {};

let gpsWatchId = null;
let searchInterval = null;
let currentTargetId = null;

let gpsStarting = false;
let gpsStopping = false;
let locationInFlight = false;

let messageTimeout = null;
let batteryObject = null;

let firebaseMessaging = null;
let familleServiceWorker = null;

let notificationButton = null;
let alertButton = null;

/* ================= ÉLÉMENTS HTML ================= */

const $ = id => document.getElementById(id);

const authSection = $('authSection');
const appSection = $('appSection');

const registerForm = $('registerForm');
const loginForm = $('loginForm');

const registerName = $('registerName');
const registerEmail = $('registerEmail');
const registerPassword = $('registerPassword');

const loginEmail = $('loginEmail');
const loginPassword = $('loginPassword');

const userName = $('userName');
const myGpsId = $('myGpsId');

const sharingStatus = $('sharingStatus');
const startSharingBtn = $('startSharingBtn');
const stopSharingBtn = $('stopSharingBtn');

const myLocation = $('myLocation');
const myBattery = $('myBattery');
const myUpdatedAt = $('myUpdatedAt');

const searchForm = $('searchForm');
const searchGpsId = $('searchGpsId');
const searchResult = $('searchResult');

const messageBox = $('messageBox');

const logoutBtn = $('logoutBtn');
const copyIdBtn = $('copyIdBtn');

const showLoginBtn = $('showLoginBtn');
const showRegisterBtn = $('showRegisterBtn');

const searchSubmitBtn = searchForm
  ? searchForm.querySelector('[type="submit"]')
  : null;

/* ================= SUPABASE ================= */

try {
  if (!window.supabase) {
    throw new Error('Bibliothèque Supabase introuvable.');
  }

  db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

} catch (error) {
  console.error('Initialisation Supabase :', error);
}

/* ================= MESSAGES ================= */

function afficherMessage(message, type = 'info') {
  if (!messageBox) return;

  messageBox.textContent = message;
  messageBox.className = `message-box ${type}`;
  messageBox.classList.remove('hidden');

  if (messageTimeout) {
    clearTimeout(messageTimeout);
  }

  messageTimeout = setTimeout(() => {
    messageBox.classList.add('hidden');
  }, 6000);
}

function cacherMessage() {
  if (!messageBox) return;

  messageBox.classList.add('hidden');

  if (messageTimeout) {
    clearTimeout(messageTimeout);
    messageTimeout = null;
  }
}

function afficherResultat(message, type = 'info') {
  if (!searchResult) return;

  searchResult.textContent = message;
  searchResult.className = `search-result ${type}`;
  searchResult.classList.remove('hidden');
}

/* ================= FIREBASE MESSAGING ================= */

function initialiserFirebaseMessaging() {
  try {
    if (
      !window.firebase ||
      !firebase.apps ||
      typeof firebase.messaging !== 'function'
    ) {
      console.warn('Firebase Messaging indisponible.');
      return false;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }

    firebaseMessaging = firebase.messaging();

    firebaseMessaging.onMessage(payload => {
      console.log(
        'Notification reçue au premier plan :',
        payload
      );

      const title =
        payload.notification?.title || 'Famille GPS';

      const body =
        payload.notification?.body ||
        'Un proche souhaite te retrouver.';

      afficherMessage(`${title} : ${body}`, 'info');
    });

    console.log('Firebase Messaging initialisé.');

    return true;

  } catch (error) {
    console.error('Initialisation Firebase :', error);
    return false;
  }
}

/* ================= BOUTON NOTIFICATIONS ================= */

function creerBoutonNotifications() {
  if (!appSection || notificationButton) return;

  notificationButton = document.createElement('button');

  notificationButton.type = 'button';
  notificationButton.id = 'enableNotificationsBtn';
  notificationButton.textContent = 'Activer les notifications';

  notificationButton.style.margin = '10px 0';
  notificationButton.style.padding = '12px 18px';
  notificationButton.style.borderRadius = '8px';
  notificationButton.style.cursor = 'pointer';

  notificationButton.addEventListener(
    'click',
    activerNotifications
  );

  const container = sharingStatus?.parentElement || appSection;

  container.appendChild(notificationButton);
}

/* ================= ACTIVER NOTIFICATIONS ================= */

async function activerNotifications() {
  if (!currentUser || !db) {
    afficherMessage(
      'Connecte-toi avant d’activer les notifications.',
      'warning'
    );
    return;
  }

  if (!('Notification' in window)) {
    afficherMessage(
      'Ton navigateur ne prend pas en charge les notifications.',
      'error'
    );
    return;
  }

  if (!('serviceWorker' in navigator)) {
    afficherMessage(
      'Le Service Worker n’est pas disponible.',
      'error'
    );
    return;
  }

  if (!window.isSecureContext) {
    afficherMessage(
      'Les notifications nécessitent une connexion HTTPS.',
      'error'
    );
    return;
  }

  if (!firebaseMessaging && !initialiserFirebaseMessaging()) {
    afficherMessage(
      'Firebase Messaging n’a pas pu être initialisé.',
      'error'
    );
    return;
  }

  if (notificationButton) {
    notificationButton.disabled = true;
    notificationButton.textContent = 'Activation en cours...';
  }

  try {
    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      throw new Error(
        'Autorisation des notifications refusée.'
      );
    }

    if (!familleServiceWorker) {
      familleServiceWorker =
        await navigator.serviceWorker.register(
          './service-worker.js'
        );
    }

    await navigator.serviceWorker.ready;

    const token = await firebaseMessaging.getToken({
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: familleServiceWorker
    });

    if (!token) {
      throw new Error(
        'Firebase n’a pas fourni de jeton pour cet appareil.'
      );
    }

    const {
      data: sessionData,
      error: sessionError
    } = await db.auth.getSession();

    if (sessionError) throw sessionError;

    const authenticatedUser = sessionData.session?.user;

    if (
      !authenticatedUser ||
      authenticatedUser.id !== currentUser.id
    ) {
      throw new Error(
        'Session utilisateur invalide. Reconnecte-toi.'
      );
    }

    const { error: saveError } = await db
      .from('family_device_tokens')
      .upsert(
        {
          auth_user_id: authenticatedUser.id,
          fcm_token: token,
          platform: 'web',
          updated_at: new Date().toISOString()
        },
        {
          onConflict: 'fcm_token'
        }
      );

    if (saveError) throw saveError;

    if (notificationButton) {
      notificationButton.textContent =
        'Notifications activées';

      notificationButton.disabled = false;
    }

    afficherMessage(
      'Notifications activées sur cet appareil !',
      'success'
    );

  } catch (error) {
    console.error('Activation notifications :', error);

    if (notificationButton) {
      notificationButton.disabled = false;
      notificationButton.textContent =
        'Réessayer d’activer les notifications';
    }

    afficherMessage(
      'Impossible d’activer les notifications : ' +
      error.message,
      'error'
    );
  }
}

/* ================= FORMULAIRES ================= */

function afficherFormulaire(type) {
  const inscription = type === 'register';

  registerForm?.classList.toggle('hidden', !inscription);
  loginForm?.classList.toggle('hidden', inscription);

  showRegisterBtn?.classList.toggle('active', inscription);
  showLoginBtn?.classList.toggle('active', !inscription);

  cacherMessage();
}

showLoginBtn?.addEventListener('click', () => {
  afficherFormulaire('login');
});

showRegisterBtn?.addEventListener('click', () => {
  afficherFormulaire('register');
});

/* ================= ÉCRANS ================= */

function afficherConnexion() {
  authSection?.classList.remove('hidden');
  appSection?.classList.add('hidden');
  logoutBtn?.classList.add('hidden');

  arreterActualisationRecherche();
  arreterSuiviLocal();
  supprimerBoutonAlerte();

  actualiserStatutPartage();
}

function afficherApplication() {
  authSection?.classList.add('hidden');
  appSection?.classList.remove('hidden');
  logoutBtn?.classList.remove('hidden');

  creerBoutonNotifications();

  setTimeout(() => {
    initialiserCarte();
    map?.invalidateSize();
  }, 300);
}

/* ================= INSCRIPTION ================= */

async function inscrireUtilisateur(event) {
  event.preventDefault();

  if (!db) {
    afficherMessage('Supabase est indisponible.', 'error');
    return;
  }

  const name = registerName?.value.trim() || '';
  const email = registerEmail?.value.trim() || '';
  const password = registerPassword?.value || '';

  if (name.length < 2) {
    afficherMessage('Entre ton nom complet.', 'error');
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    afficherMessage('Entre une adresse email valide.', 'error');
    return;
  }

  if (password.length < 8) {
    afficherMessage(
      'Le mot de passe doit contenir au moins 8 caractères.',
      'error'
    );
    return;
  }

  const button = registerForm?.querySelector('[type="submit"]');

  if (button) {
    button.disabled = true;
    button.textContent = 'Inscription en cours...';
  }

  try {
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: name
        }
      }
    });

    if (error) throw error;

    if (data.session && data.user) {
      await chargerProfil(data.user);

    } else {
      registerForm?.reset();

      afficherFormulaire('login');

      if (loginEmail) {
        loginEmail.value = email;
      }

      afficherMessage(
        'Inscription enregistrée. Vérifie ton email, puis connecte-toi. Ton profil GPS doit être créé automatiquement par Supabase.',
        'success'
      );
    }

  } catch (error) {
    console.error('Inscription :', error);

    afficherMessage(
      'Inscription impossible : ' + error.message,
      'error'
    );

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Créer mon compte';
    }
  }
}

/* ================= CONNEXION ================= */

async function connecterUtilisateur(event) {
  event.preventDefault();

  if (!db) {
    afficherMessage('Supabase est indisponible.', 'error');
    return;
  }

  const email = loginEmail?.value.trim() || '';
  const password = loginPassword?.value || '';

  if (!email || !password) {
    afficherMessage(
      'Renseigne ton email et ton mot de passe.',
      'error'
    );
    return;
  }

  const button = loginForm?.querySelector('[type="submit"]');

  if (button) {
    button.disabled = true;
    button.textContent = 'Connexion...';
  }

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    await chargerProfil(data.user);

  } catch (error) {
    console.error('Connexion :', error);

    let message = error.message || 'Erreur inconnue.';

    if (/email not confirmed/i.test(message)) {
      message = 'Ton email n’est pas encore confirmé.';
    }

    afficherMessage(
      'Connexion impossible : ' + message,
      'error'
    );

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Se connecter';
    }
  }
}

/* ================= CHARGEMENT DU PROFIL ================= */

async function chargerProfil(user) {
  if (!user || !db) return;

  currentUser = user;

  try {
    const { data: authData, error: authError } =
      await db.auth.getUser();

    console.log(
      '[Famille GPS] Utilisateur authentifié :',
      authData?.user?.id || null
    );

    console.log(
      '[Famille GPS] UUID utilisateur attendu :',
      user.id
    );

    if (authError || !authData?.user) {
      throw authError || new Error(
        'Utilisateur non authentifié.'
      );
    }

    if (authData.user.id !== user.id) {
      throw new Error(
        'La session authentifiée ne correspond pas à cet utilisateur.'
      );
    }

    const { data, error } = await db
      .from('family_users')
      .select(`
        id,
        name,
        share_enabled,
        latitude,
        longitude,
        battery_level,
        updated_at
      `)
      .eq('auth_user_id', authData.user.id)
      .single();

    if (error) {
      console.error('[Famille GPS] Erreur profil :', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });

      if (error.code === 'PGRST116') {
        throw new Error(
          'Profil GPS introuvable. Vérifie que le déclencheur Supabase a créé ton profil.'
        );
      }

      throw error;
    }

    if (!data) {
      throw new Error(
        'Profil GPS introuvable dans family_users.'
      );
    }

    console.log('[Famille GPS] Profil chargé :', data);

    myProfile = data;

    if (userName) {
      userName.textContent = data.name || 'Utilisateur';
    }

    if (myGpsId) {
      myGpsId.textContent = data.id;
    }

    afficherApplication();

    actualiserStatutPartage();
    actualiserInformationsProfil();

    if (
      data.share_enabled &&
      data.latitude != null &&
      data.longitude != null
    ) {
      afficherMaPosition(data.latitude, data.longitude);

      afficherMessage(
        'Le partage est activé sur ton compte. Appuie sur Activer pour reprendre le suivi GPS sur cet appareil.',
        'warning'
      );

    } else if (data.share_enabled) {
      afficherMessage(
        'Le partage est activé, mais aucune position récente n’est disponible.',
        'warning'
      );
    }

  } catch (error) {
    console.error('Chargement profil :', error);

    afficherMessage(
      'Impossible de charger ton profil : ' + error.message,
      'error'
    );
  }
}

/* ================= STATUT DU PARTAGE ================= */

function actualiserStatutPartage() {
  if (!sharingStatus || !myProfile) return;

  const active = !!myProfile.share_enabled;

  sharingStatus.textContent = active
    ? 'Partage GPS activé'
    : 'Partage GPS désactivé';

  sharingStatus.className = active
    ? 'status-badge status-on'
    : 'status-badge status-off';

  if (startSharingBtn) {
    startSharingBtn.disabled =
      active || gpsStarting || gpsStopping;
  }

  if (stopSharingBtn) {
    stopSharingBtn.disabled =
      !active || gpsStopping || gpsStarting;
  }
}

/* ================= CARTE LEAFLET ================= */

function initialiserCarte() {
  const element = $('map');

  if (!element) return;

  if (typeof L === 'undefined') {
    console.error('Bibliothèque Leaflet introuvable.');
    return;
  }

  if (map) {
    map.invalidateSize();
    return;
  }

  map = L.map('map').setView([5.36, -4.0083], 12);

  const carteClassique = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }
  );

  const carteSatellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics et contributeurs',
      maxZoom: 19
    }
  );

  carteClassique.addTo(map);

  const couches = {
    'Plan classique': carteClassique,
    'Vue satellite': carteSatellite
  };

  L.control.layers(
    couches,
    null,
    {
      position: 'topright',
      collapsed: false
    }
  ).addTo(map);

  console.log('Carte familiale initialisée.');
}

/* ================= ICÔNES GPS ================= */

function creerIconeGPS(couleur) {
  return L.divIcon({
    className: '',
    html: `<span class="gps-marker ${couleur}"></span>`,
    iconSize: [25, 25],
    iconAnchor: [12, 12]
  });
}

/* ================= MA POSITION ================= */

function afficherMaPosition(latitude, longitude) {
  initialiserCarte();

  if (!map) return;

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    console.error('Coordonnées personnelles invalides.');
    return;
  }

  const position = [lat, lng];

  if (markers.me) {
    markers.me.setLatLng(position);

  } else {
    markers.me = L.marker(position, {
      icon: creerIconeGPS('red')
    })
      .addTo(map)
      .bindPopup('Ma position');
  }

  map.setView(position, 15);
}

/* ================= OBTENIR POSITION GPS ================= */

function obtenirPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(
        new Error('La géolocalisation n’est pas disponible.')
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      resolve,

      error => {
        const messages = {
          1: 'Autorise la localisation dans les paramètres de ton navigateur.',
          2: 'Position GPS indisponible. Vérifie ton GPS.',
          3: 'La demande GPS a expiré. Réessaie.'
        };

        reject(
          new Error(
            messages[error.code] || 'Erreur de géolocalisation.'
          )
        );
      },

      GPS_OPTIONS
    );
  });
}

/* ================= BATTERIE ================= */

async function obtenirBatterie() {
  if (!navigator.getBattery) return null;

  try {
    if (!batteryObject) {
      batteryObject = await navigator.getBattery();
    }

    return Math.round(batteryObject.level * 100);

  } catch (error) {
    console.warn('Batterie indisponible :', error);
    return null;
  }
}

/* ================= DÉMARRER LE PARTAGE ================= */

async function demarrerPartageGPS() {
  if (gpsStarting || gpsStopping || gpsWatchId !== null) {
    return;
  }

  if (!currentUser || !myProfile) {
    afficherMessage(
      'Connecte-toi avant d’activer le GPS.',
      'warning'
    );
    return;
  }

  if (
    !window.isSecureContext ||
    !navigator.geolocation
  ) {
    afficherMessage(
      'Le GPS nécessite une connexion HTTPS et un appareil compatible.',
      'error'
    );
    return;
  }

  gpsStarting = true;
  actualiserStatutPartage();

  let serveurActive = false;

  try {
    const firstPosition = await obtenirPosition();

    const { error } = await db.rpc(
      'set_my_sharing',
      {
        p_enabled: true
      }
    );

    if (error) throw error;

    serveurActive = true;
    myProfile.share_enabled = true;

    gpsWatchId = navigator.geolocation.watchPosition(
      position => {
        traiterNouvellePosition(position).catch(error => {
          console.error('Enregistrement GPS :', error);

          afficherMessage(
            'Erreur de mise à jour GPS : ' + error.message,
            'error'
          );
        });
      },

      error => {
        console.error('Suivi GPS :', error);

        const messages = {
          1: 'Autorisation GPS refusée.',
          2: 'Position GPS indisponible.',
          3: 'Délai GPS dépassé.'
        };

        afficherMessage(
          messages[error.code] ||
          'Le suivi GPS a rencontré une erreur.',
          'error'
        );
      },

      GPS_OPTIONS
    );

    if (gpsWatchId === null) {
      throw new Error('Impossible de démarrer le suivi GPS.');
    }

    await traiterNouvellePosition(firstPosition);

    afficherMessage(
      'Partage activé ! Ta position est maintenant disponible.',
      'success'
    );

  } catch (error) {
    console.error('Activation GPS :', error);

    arreterSuiviLocal();

    if (serveurActive) {
      const { error: stopError } = await db.rpc(
        'set_my_sharing',
        {
          p_enabled: false
        }
      );

      if (stopError) {
        afficherMessage(
          'Erreur GPS : ' + error.message +
          '. Attention : le partage serveur n’a pas pu être désactivé : ' +
          stopError.message,
          'error'
        );

      } else {
        myProfile.share_enabled = false;

        afficherMessage(
          'Activation interrompue : ' + error.message,
          'error'
        );
      }

    } else {
      afficherMessage(
        'Activation impossible : ' + error.message,
        'error'
      );
    }

  } finally {
    gpsStarting = false;
    actualiserStatutPartage();
  }
}

/* ================= ENREGISTRER POSITION ================= */

async function traiterNouvellePosition(position) {
  if (
    !currentUser ||
    !myProfile ||
    !myProfile.share_enabled
  ) {
    return;
  }

  if (
    gpsWatchId === null ||
    locationInFlight
  ) {
    return;
  }

  locationInFlight = true;

  try {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new Error('Coordonnées GPS invalides.');
    }

    const batteryLevel = await obtenirBatterie();

    const { error } = await db.rpc(
      'update_my_location',
      {
        p_latitude: latitude,
        p_longitude: longitude,
        p_battery_level: batteryLevel
      }
    );

    if (error) throw error;

    myProfile.latitude = latitude;
    myProfile.longitude = longitude;
    myProfile.battery_level = batteryLevel;
    myProfile.updated_at = new Date().toISOString();

    afficherMaPosition(latitude, longitude);
    actualiserInformationsProfil();

  } finally {
    locationInFlight = false;
  }
}

/* ================= ARRÊTER LE GPS LOCAL ================= */

function arreterSuiviLocal() {
  if (
    gpsWatchId !== null &&
    navigator.geolocation
  ) {
    navigator.geolocation.clearWatch(gpsWatchId);
  }

  gpsWatchId = null;
  locationInFlight = false;
}

/* ================= DÉSACTIVER LE PARTAGE ================= */

async function arreterPartageGPS(confirmer = true) {
  if (gpsStopping || !currentUser || !myProfile) {
    return false;
  }

  if (
    confirmer &&
    !confirm(
      'Désactiver le partage GPS et effacer ta dernière position enregistrée ?'
    )
  ) {
    return false;
  }

  gpsStopping = true;

  if (stopSharingBtn) {
    stopSharingBtn.textContent = 'Arrêt en cours...';
  }

  arreterSuiviLocal();

  try {
    const { error } = await db.rpc(
      'set_my_sharing',
      {
        p_enabled: false
      }
    );

    if (error) throw error;

    myProfile.share_enabled = false;
    myProfile.latitude = null;
    myProfile.longitude = null;
    myProfile.battery_level = null;
    myProfile.updated_at = new Date().toISOString();

    if (markers.me && map) {
      map.removeLayer(markers.me);
      delete markers.me;
    }

    actualiserInformationsProfil();

    afficherMessage(
      'Partage désactivé. Tes anciennes coordonnées ont été effacées.',
      'success'
    );

    return true;

  } catch (error) {
    console.error('Arrêt GPS :', error);

    afficherMessage(
      'Le GPS local est arrêté, mais la désactivation serveur a échoué : ' +
      error.message,
      'error'
    );

    return false;

  } finally {
    gpsStopping = false;

    if (stopSharingBtn) {
      stopSharingBtn.textContent = 'Arrêter le partage';
    }

    actualiserStatutPartage();
  }
}

/* ================= INFORMATIONS PROFIL ================= */

function actualiserInformationsProfil() {
  if (!myProfile) return;

  if (myLocation) {
    myLocation.textContent =
      myProfile.latitude != null &&
      myProfile.longitude != null
        ? `${Number(myProfile.latitude).toFixed(6)}, ${Number(myProfile.longitude).toFixed(6)}`
        : 'Position non disponible';
  }

  if (myBattery) {
    myBattery.textContent =
      myProfile.battery_level != null
        ? `Batterie : ${myProfile.battery_level}%`
        : 'Batterie : non disponible';
  }

  if (myUpdatedAt) {
    myUpdatedAt.textContent =
      myProfile.updated_at
        ? 'Mise à jour : ' +
          new Date(myProfile.updated_at).toLocaleString('fr-FR')
        : 'Aucune mise à jour';
  }
}

/* ================= RECHERCHER UN MEMBRE ================= */

async function rechercherMembre(memberId) {
  if (!db) {
    throw new Error('Connexion Supabase indisponible.');
  }

  const numericId = Number(memberId);

  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    throw new Error('Identifiant GPS invalide.');
  }

  const { data, error } = await db.rpc(
    'find_family_member',
    {
      p_member_id: numericId
    }
  );

  if (error) throw error;

  const row = Array.isArray(data)
    ? data[0] || null
    : data;

  if (!row) return null;

  return {
    id: row.member_id,
    name: row.member_name,
    share_enabled: row.sharing_enabled,
    latitude: row.member_latitude,
    longitude: row.member_longitude,
    battery_level: row.member_battery,
    updated_at: row.location_updated_at
  };
}

/* ================= BOUTON ALERTE ================= */

function supprimerBoutonAlerte() {
  if (alertButton) {
    alertButton.remove();
    alertButton = null;
  }
}

function afficherBoutonAlerte(memberId) {
  if (!searchResult) return;

  supprimerBoutonAlerte();

  alertButton = document.createElement('button');
  alertButton.type = 'button';
  alertButton.id = 'sendGpsAlertBtn';
  alertButton.textContent = 'Envoyer une alerte';

  alertButton.style.marginTop = '10px';
  alertButton.style.padding = '12px 18px';
  alertButton.style.borderRadius = '8px';
  alertButton.style.cursor = 'pointer';

  alertButton.addEventListener('click', () => {
    envoyerAlerteGPS(memberId, alertButton);
  });

  searchResult.insertAdjacentElement(
    'afterend',
    alertButton
  );
}

/* ================= ENVOYER UNE ALERTE ================= */

async function envoyerAlerteGPS(memberId, button) {
  if (!currentUser || !db) {
    afficherResultat(
      'Connecte-toi pour envoyer une alerte.',
      'error'
    );
    return;
  }

  const id = Number(memberId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    afficherResultat(
      'Identifiant du membre invalide.',
      'error'
    );
    return;
  }

  if (Number(id) === Number(myProfile?.id)) {
    afficherResultat(
      'Tu ne peux pas t’envoyer une alerte à toi-même.',
      'warning'
    );
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = 'Envoi en cours...';
  }

  try {
    // Vérifier à nouveau le partage avant l'envoi.
    const member = await rechercherMembre(id);

    if (!member) {
      throw new Error('Membre introuvable.');
    }

    if (member.share_enabled) {
      supprimerBoutonAlerte();

      afficherResultat(
        'Ce membre a maintenant activé son partage GPS.',
        'success'
      );

      return;
    }

    const {
      data: sessionData,
      error: sessionError
    } = await db.auth.getSession();

    if (sessionError) throw sessionError;

    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      throw new Error('Session expirée. Reconnecte-toi.');
    }

    const response = await fetch('/api/send-alert', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        targetMemberId: id
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || 'L’envoi de l’alerte a échoué.'
      );
    }

    afficherResultat(
      'Alerte envoyée ! Le membre recevra une notification si son appareil est joignable.',
      'success'
    );

    if (button) {
      button.textContent = 'Alerte envoyée';
    }

  } catch (error) {
    console.error('Envoi alerte GPS :', error);

    afficherResultat(
      error.message || 'Impossible d’envoyer l’alerte.',
      'error'
    );

    if (button) {
      button.disabled = false;
      button.textContent = 'Renvoyer une alerte';
    }
  }
}

/* ================= FORMULAIRE RECHERCHE ================= */

async function observerAmi(event) {
  event?.preventDefault();

  supprimerBoutonAlerte();

  if (!currentUser) {
    afficherResultat(
      'Connecte-toi pour rechercher un membre.',
      'error'
    );
    return;
  }

  const targetId = searchGpsId?.value.trim() || '';

  if (!/^[1-9][0-9]*$/.test(targetId)) {
    afficherResultat(
      'Entre un identifiant GPS numérique valide.',
      'error'
    );
    return;
  }

  if (searchSubmitBtn) {
    searchSubmitBtn.disabled = true;
  }

  try {
    const member = await rechercherMembre(targetId);

    if (!member) {
      arreterActualisationRecherche();

      afficherResultat(
        'Aucun membre trouvé avec cet identifiant.',
        'warning'
      );
      return;
    }

    if (
      Number(member.id) === Number(myProfile?.id)
    ) {
      arreterActualisationRecherche();

      afficherResultat(
        'Il s’agit de ton propre identifiant GPS.',
        'info'
      );
      return;
    }

    arreterActualisationRecherche();

    currentTargetId = String(member.id);

    if (!member.share_enabled) {
      supprimerMarqueurRecherche(currentTargetId);

      afficherResultat(
        `${member.name || 'Ce membre'} ne partage pas actuellement sa position.`,
        'warning'
      );

      afficherBoutonAlerte(member.id);
      return;
    }

    if (
      member.latitude == null ||
      member.longitude == null
    ) {
      demarrerActualisationRecherche();

      afficherResultat(
        `${member.name || 'Ce membre'} a activé le partage, mais aucune position n'est encore disponible.`,
        'warning'
      );
      return;
    }

    afficherPositionMembre(member);

    afficherResultat(
      `Position partagée de ${member.name || 'ce membre'}. Actualisation toutes les 10 secondes lorsque l'application est active.`,
      'success'
    );

    demarrerActualisationRecherche();

  } catch (error) {
    console.error('Recherche :', error);

    afficherResultat(
      'Recherche impossible : ' + error.message,
      'error'
    );

  } finally {
    if (searchSubmitBtn) {
      searchSubmitBtn.disabled = false;
    }
  }
}

/* ================= POSITION D'UN MEMBRE ================= */

function afficherPositionMembre(member) {
  if (
    member.latitude == null ||
    member.longitude == null
  ) {
    return;
  }

  initialiserCarte();

  if (!map) return;

  const latitude = Number(member.latitude);
  const longitude = Number(member.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    afficherResultat(
      'Coordonnées GPS invalides.',
      'error'
    );
    return;
  }

  const id = String(member.id);
  const position = [latitude, longitude];

  if (markers[id]) {
    markers[id].setLatLng(position);

  } else {
    markers[id] = L.marker(position, {
      icon: creerIconeGPS('blue')
    }).addTo(map);
  }

  const popup = document.createElement('div');

  const name = document.createElement('strong');
  const idLine = document.createElement('div');

  name.textContent = member.name || 'Membre';
  idLine.textContent = `ID GPS : ${member.id}`;

  popup.append(name, idLine);

  markers[id].bindPopup(popup);

  map.setView(position, 15);
}

/* ================= SUPPRIMER MARQUEUR ================= */

function supprimerMarqueurRecherche(id) {
  if (markers[id] && map) {
    map.removeLayer(markers[id]);
    delete markers[id];
  }
}

/* ================= ACTUALISATION RECHERCHE ================= */

function demarrerActualisationRecherche() {
  arreterActualisationRecherche(false);

  if (!currentTargetId) return;

  searchInterval = setInterval(async () => {
    const id = currentTargetId;

    if (!id || !currentUser) return;

    try {
      const member = await rechercherMembre(id);

      if (currentTargetId !== id) return;

      if (!member) {
        supprimerMarqueurRecherche(id);
        arreterActualisationRecherche();

        afficherResultat(
          'Ce membre est introuvable.',
          'warning'
        );

        supprimerBoutonAlerte();
        return;
      }

      if (!member.share_enabled) {
        supprimerMarqueurRecherche(id);
        arreterActualisationRecherche(false);

        afficherResultat(
          'Ce membre ne partage plus sa position.',
          'warning'
        );

        afficherBoutonAlerte(member.id);
        return;
      }

      supprimerBoutonAlerte();

      if (
        member.latitude == null ||
        member.longitude == null
      ) {
        supprimerMarqueurRecherche(id);

        afficherResultat(
          `${member.name || 'Ce membre'} partage sa position, mais aucune position n'est disponible.`,
          'warning'
        );
        return;
      }

      afficherPositionMembre(member);

    } catch (error) {
      console.error('Actualisation recherche :', error);
    }

  }, REFRESH_INTERVAL);
}

function arreterActualisationRecherche(effacerCible = true) {
  if (searchInterval !== null) {
    clearInterval(searchInterval);
    searchInterval = null;
  }

  if (effacerCible) {
    currentTargetId = null;
  }
}

/* ================= COPIER IDENTIFIANT ================= */

copyIdBtn?.addEventListener('click', async () => {
  if (!myProfile) return;

  try {
    if (!navigator.clipboard) {
      throw new Error('Presse-papiers indisponible.');
    }

    await navigator.clipboard.writeText(
      String(myProfile.id)
    );

    afficherMessage(
      'Identifiant GPS copié !',
      'success'
    );

  } catch (error) {
    afficherMessage(
      'Copie automatique impossible. Ton identifiant GPS est : ' +
      myProfile.id,
      'warning'
    );
  }
});

/* ================= DÉCONNEXION ================= */

async function deconnecterUtilisateur() {
  if (!currentUser || !db) return;

  if (gpsStarting || gpsStopping) {
    afficherMessage(
      'Patiente quelques instants avant de te déconnecter.',
      'warning'
    );
    return;
  }

  if (myProfile?.share_enabled) {
    const ok = confirm(
      'Ton partage GPS est activé. Désactiver le partage et effacer tes coordonnées avant de te déconnecter ?'
    );

    if (!ok) return;

    const stopped = await arreterPartageGPS(false);

    if (!stopped) {
      afficherMessage(
        'Déconnexion annulée : le partage n’a pas pu être désactivé.',
        'error'
      );
      return;
    }

  } else {
    arreterSuiviLocal();
  }

  arreterActualisationRecherche();
  supprimerBoutonAlerte();

  try {
    const { error } = await db.auth.signOut();

    if (error) throw error;

    currentUser = null;
    myProfile = null;

    Object.keys(markers).forEach(id => {
      if (map) {
        map.removeLayer(markers[id]);
      }

      delete markers[id];
    });

    afficherConnexion();
    afficherFormulaire('login');

    afficherMessage(
      'Tu es déconnecté.',
      'success'
    );

  } catch (error) {
    afficherMessage(
      'Erreur de déconnexion : ' + error.message,
      'error'
    );
  }
}

/* ================= ÉVÉNEMENTS ================= */

registerForm?.addEventListener(
  'submit',
  inscrireUtilisateur
);

loginForm?.addEventListener(
  'submit',
  connecterUtilisateur
);

startSharingBtn?.addEventListener(
  'click',
  demarrerPartageGPS
);

stopSharingBtn?.addEventListener(
  'click',
  () => arreterPartageGPS(true)
);

searchForm?.addEventListener(
  'submit',
  observerAmi
);

logoutBtn?.addEventListener(
  'click',
  deconnecterUtilisateur
);

/* ================= RESTAURER SESSION ================= */

async function restaurerSession() {
  if (!db) {
    afficherConnexion();

    afficherMessage(
      'Supabase est indisponible. Vérifie la configuration.',
      'error'
    );
    return;
  }

  try {
    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    if (data.session?.user) {
      await chargerProfil(data.session.user);

    } else {
      afficherConnexion();
      afficherFormulaire('login');
    }

  } catch (error) {
    console.error('Restauration session :', error);

    afficherConnexion();

    afficherMessage(
      'Impossible de restaurer la session : ' + error.message,
      'error'
    );
  }
}

/* ================= ÉCOUTER LA SESSION ================= */

if (db) {
  db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      myProfile = null;

      arreterSuiviLocal();
      arreterActualisationRecherche();
      supprimerBoutonAlerte();

      afficherConnexion();
      afficherFormulaire('login');
    }
  });
}

/* ================= SERVICE WORKER ================= */

async function enregistrerServiceWorker() {
  if (
    !('serviceWorker' in navigator) ||
    !window.isSecureContext
  ) {
    return;
  }

  try {
    familleServiceWorker =
      await navigator.serviceWorker.register(
        './service-worker.js'
      );

    await navigator.serviceWorker.ready;

    console.log('Service Worker activé.');

  } catch (error) {
    console.error('Service Worker :', error);
  }
}

/* ================= DÉMARRAGE ================= */

async function demarrerApplication() {
  afficherFormulaire('login');

  await enregistrerServiceWorker();

  initialiserFirebaseMessaging();

  await restaurerSession();

  obtenirBatterie();

  console.log(
    'Famille GPS - Dev.Assamoi : application initialisée.'
  );
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    demarrerApplication,
    { once: true }
  );
} else {
  demarrerApplication();
}

/* ================= COMPATIBILITÉ ================= */

window.observerAmi = observerAmi;
window.demarrerPartageGPS = demarrerPartageGPS;
window.arreterPartageGPS = arreterPartageGPS;
window.activerNotifications = activerNotifications;
window.envoyerAlerteGPS = envoyerAlerteGPS;
