
/* =========================================================
   FAMILLE GPS - Dev.Assamoi
   Supabase Auth + Leaflet + GPS volontaire
   ========================================================= */

'use strict';

/* =========================================================
   CONFIGURATION
   ========================================================= */

const SUPABASE_URL = 'https://qcdxsafopgihmdwudayb.supabase.co';

const SUPABASE_KEY = 'sb_publishable_sSgPsSwF436uHqtqgF9ytw_RKqqwIjt';

const REFRESH_INTERVAL = 10000;

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
let batteryObject = null;
let authSubscription = null;

/* =========================================================
   ÉLÉMENTS HTML
   ========================================================= */

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

/* =========================================================
   INITIALISATION SUPABASE
   ========================================================= */

try {
  if (!window.supabase) {
    throw new Error('La bibliothèque Supabase est introuvable.');
  }

  db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

} catch (error) {
  console.error(error);
  afficherMessage(error.message, 'error');
}

/* =========================================================
   MESSAGES
   ========================================================= */

function afficherMessage(message, type = 'info') {
  if (!messageBox) return;

  messageBox.textContent = message;
  messageBox.className = `message-box ${type}`;
  messageBox.classList.remove('hidden');
}

function cacherMessage() {
  if (messageBox) {
    messageBox.classList.add('hidden');
  }
}

function afficherResultat(message, type = 'info') {
  if (!searchResult) return;

  searchResult.textContent = message;
  searchResult.className = `search-result ${type}`;
  searchResult.classList.remove('hidden');
}

/* =========================================================
   AFFICHAGE DES ÉCRANS
   ========================================================= */

function afficherConnexion() {
  if (authSection) authSection.classList.remove('hidden');
  if (appSection) appSection.classList.add('hidden');

  arreterActualisationRecherche();
  arreterSuiviLocal();
}

function afficherApplication() {
  if (authSection) authSection.classList.add('hidden');
  if (appSection) appSection.classList.remove('hidden');

  setTimeout(() => {
    initialiserCarte();
    if (map) map.invalidateSize();
  }, 300);
}

/* =========================================================
   BASCULER ENTRE CONNEXION ET INSCRIPTION
   ========================================================= */

function afficherFormulaire(type) {
  const isRegister = type === 'register';

  if (registerForm) {
    registerForm.classList.toggle('hidden', !isRegister);
  }

  if (loginForm) {
    loginForm.classList.toggle('hidden', isRegister);
  }

  if (showRegisterBtn) {
    showRegisterBtn.classList.toggle('active', isRegister);
  }

  if (showLoginBtn) {
    showLoginBtn.classList.toggle('active', !isRegister);
  }

  cacherMessage();
}

if (showLoginBtn) {
  showLoginBtn.addEventListener('click', () => {
    afficherFormulaire('login');
  });
}

if (showRegisterBtn) {
  showRegisterBtn.addEventListener('click', () => {
    afficherFormulaire('register');
  });
}

/* =========================================================
   INSCRIPTION
   ========================================================= */

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

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    afficherMessage('Entre une adresse email valide.', 'error');
    return;
  }

  if (password.length < 8) {
    afficherMessage('Le mot de passe doit contenir au moins 8 caractères.', 'error');
    return;
  }

  const submitButton = registerForm.querySelector('[type="submit"]');

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Inscription en cours...';
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
      afficherMessage(
        'Inscription réussie ! Ton profil GPS a été créé.',
        'success'
      );

      await chargerProfil(data.user);

    } else {
      afficherMessage(
        'Inscription enregistrée ! Consulte ta boîte email pour confirmer ton adresse, puis connecte-toi.',
        'success'
      );

      registerForm.reset();
      afficherFormulaire('login');
    }

  } catch (error) {
    console.error('Inscription :', error);
    afficherMessage(
      'Inscription impossible : ' + error.message,
      'error'
    );

  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Créer mon compte';
    }
  }
}

/* =========================================================
   CONNEXION
   ========================================================= */

async function connecterUtilisateur(event) {
  event.preventDefault();

  if (!db) {
    afficherMessage('Supabase est indisponible.', 'error');
    return;
  }

  const email = loginEmail?.value.trim() || '';
  const password = loginPassword?.value || '';

  if (!email || !password) {
    afficherMessage('Renseigne ton email et ton mot de passe.', 'error');
    return;
  }

  const submitButton = loginForm.querySelector('[type="submit"]');

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Connexion...';
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

    let message = error.message;

    if (/email not confirmed/i.test(message)) {
      message = 'Ton email n’est pas encore confirmé. Consulte ta boîte email.';
    }

    afficherMessage('Connexion impossible : ' + message, 'error');

  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Se connecter';
    }
  }
}

/* =========================================================
   CHARGEMENT DU PROFIL
   ========================================================= */

async function chargerProfil(user) {
  if (!user || !db) return;

  currentUser = user;

  try {
    const { data, error } = await db
      .from('family_users')
      .select('id, name, share_enabled, latitude, longitude, battery_level, updated_at')
      .eq('auth_user_id', user.id)
      .single();

    if (error) throw error;

    if (!data) {
      throw new Error('Profil GPS introuvable.');
    }

    myProfile = data;

    if (userName) userName.textContent = data.name;

    if (myGpsId) myGpsId.textContent = data.id;

    afficherApplication();
    actualiserStatutPartage();

    if (data.share_enabled) {
      afficherMessage(
        'Ton partage est activé. Active le suivi GPS sur cet appareil pour actualiser ta position.',
        'warning'
      );
    }

    if (data.latitude != null && data.longitude != null) {
      afficherMaPosition(data.latitude, data.longitude);
    }

    actualiserInformationsProfil();

  } catch (error) {
    console.error('Chargement profil :', error);

    afficherMessage(
      'Impossible de charger ton profil : ' + error.message,
      'error'
    );
  }
}

/* =========================================================
   STATUT DU PARTAGE
   ========================================================= */

function actualiserStatutPartage() {
  if (!sharingStatus || !myProfile) return;

  if (myProfile.share_enabled) {
    sharingStatus.textContent = 'Partage GPS activé';
    sharingStatus.className = 'status-on';
  } else {
    sharingStatus.textContent = 'Partage GPS désactivé';
    sharingStatus.className = 'status-off';
  }

  if (startSharingBtn) {
    startSharingBtn.disabled = !!myProfile.share_enabled;
  }

  if (stopSharingBtn) {
    stopSharingBtn.disabled = !myProfile.share_enabled && gpsWatchId === null;
  }
}

/* =========================================================
   INITIALISATION DE LA CARTE
   ========================================================= */

function initialiserCarte() {
  const mapElement = $('map');

  if (!mapElement || typeof L === 'undefined') {
    afficherMessage('Carte indisponible. Vérifie Leaflet.', 'error');
    return;
  }

  if (map) {
    map.invalidateSize();
    return;
  }

  map = L.map('map').setView([5.3600, -4.0083], 12);

  L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }
  ).addTo(map);
}

/* =========================================================
   POSITION GPS
   ========================================================= */

function obtenirPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Géolocalisation non disponible.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      resolve,
      error => {
        const messages = {
          1: 'Autorise la localisation dans ton navigateur.',
          2: 'Position GPS indisponible.',
          3: 'La demande GPS a expiré. Réessaie.'
        };

        reject(new Error(messages[error.code] || 'Erreur GPS.'));
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000
      }
    );
  });
}

/* =========================================================
   BATTERIE
   ========================================================= */

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

/* =========================================================
   ACTIVER LE PARTAGE
   ========================================================= */

async function demarrerPartageGPS() {
  if (gpsStarting || gpsWatchId !== null) return;

  if (!currentUser || !myProfile) {
    afficherMessage('Connecte-toi avant d’activer le GPS.', 'warning');
    return;
  }

  if (!window.isSecureContext || !navigator.geolocation) {
    afficherMessage('Le GPS nécessite HTTPS et un appareil compatible.', 'error');
    return;
  }

  gpsStarting = true;

  if (startSharingBtn) {
    startSharingBtn.disabled = true;
    startSharingBtn.textContent = 'Activation...';
  }

  try {
    // Demander la permission et obtenir une première position.
    await obtenirPosition();

    // Autoriser le partage côté serveur.
    const { error } = await db.rpc('set_my_sharing', {
      p_enabled: true
    });

    if (error) throw error;

    myProfile.share_enabled = true;
    actualiserStatutPartage();

    gpsWatchId = navigator.geolocation.watchPosition(
      position => {
        traiterNouvellePosition(position).catch(error => {
          console.error('Erreur GPS :', error);
          afficherMessage(error.message, 'error');
        });
      },

      error => {
        console.error('Suivi GPS :', error);

        afficherMessage(
          'Le suivi GPS est interrompu. Vérifie les autorisations de localisation.',
          'error'
        );
      },

      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000
      }
    );

    afficherMessage(
      'Partage activé ! Ta position sera actualisée lorsque ton appareil transmettra une nouvelle position.',
      'success'
    );

  } catch (error) {
    console.error(error);

    afficherMessage(
      'Activation impossible : ' + error.message,
      'error'
    );

    if (myProfile) {
      myProfile.share_enabled = false;
      actualiserStatutPartage();
    }

  } finally {
    gpsStarting = false;

    if (startSharingBtn) {
      startSharingBtn.textContent = 'Activer le partage GPS';
    }
  }
}

/* =========================================================
   ENREGISTRER UNE NOUVELLE POSITION
   ========================================================= */

async function traiterNouvellePosition(position) {
  if (!currentUser || !myProfile || !myProfile.share_enabled) return;
  if (gpsWatchId === null || locationInFlight) return;

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

    const battery = await obtenirBatterie();

    const { error } = await db.rpc('update_my_location', {
      p_latitude: latitude,
      p_longitude: longitude,
      p_battery_level: battery
    });

    if (error) throw error;

    myProfile.latitude = latitude;
    myProfile.longitude = longitude;
    myProfile.battery_level = battery;
    myProfile.updated_at = new Date().toISOString();

    afficherMaPosition(latitude, longitude);
    actualiserInformationsProfil();

  } finally {
    locationInFlight = false;
  }
}

/* =========================================================
   AFFICHER MA POSITION
   ========================================================= */

function afficherMaPosition(latitude, longitude) {
  initialiserCarte();

  if (!map) return;

  const coordinates = [latitude, longitude];

  if (markers.me) {
    markers.me.setLatLng(coordinates);
  } else {
    markers.me = L.marker(coordinates)
      .addTo(map)
      .bindPopup('Ma position');
  }

  map.setView(coordinates, 15);
}

/* =========================================================
   ARRÊTER LE SUIVI LOCAL
   ========================================================= */

function arreterSuiviLocal() {
  if (gpsWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(gpsWatchId);
  }

  gpsWatchId = null;
  locationInFlight = false;
}

/* =========================================================
   DÉSACTIVER LE PARTAGE
   ========================================================= */

async function arreterPartageGPS() {
  if (gpsStopping || !currentUser) return;

  gpsStopping = true;

  if (stopSharingBtn) {
    stopSharingBtn.disabled = true;
    stopSharingBtn.textContent = 'Arrêt...';
  }

  // Arrêt local immédiat.
  arreterSuiviLocal();

  try {
    const { error } = await db.rpc('set_my_sharing', {
      p_enabled: false
    });

    if (error) throw error;

    if (myProfile) {
      myProfile.share_enabled = false;
      myProfile.latitude = null;
      myProfile.longitude = null;
      myProfile.battery_level = null;
      myProfile.updated_at = new Date().toISOString();
    }

    if (markers.me && map) {
      map.removeLayer(markers.me);
      delete markers.me;
    }

    if (myLocation) myLocation.textContent = 'Position non partagée';
    if (myBattery) myBattery.textContent = 'Batterie : indisponible';
    if (myUpdatedAt) myUpdatedAt.textContent = 'Position effacée';

    actualiserStatutPartage();

    afficherMessage(
      'Partage désactivé. Tes anciennes coordonnées ont été effacées.',
      'success'
    );

  } catch (error) {
    console.error('Arrêt GPS :', error);

    afficherMessage(
      'Le GPS local est arrêté, mais le serveur n’a pas confirmé la désactivation : ' + error.message,
      'error'
    );

  } finally {
    gpsStopping = false;

    if (stopSharingBtn) {
      stopSharingBtn.textContent = 'Arrêter le partage';
    }

    actualiserStatutPartage();
  }
}

/* =========================================================
   INFORMATIONS DU PROFIL
   ========================================================= */

function actualiserInformationsProfil() {
  if (!myProfile) return;

  if (myLocation) {
    myLocation.textContent =
      myProfile.latitude != null && myProfile.longitude != null
        ? `${Number(myProfile.latitude).toFixed(6)}, ${Number(myProfile.longitude).toFixed(6)}`
        : 'Position non disponible';
  }

  if (myBattery) {
    myBattery.textContent =
      myProfile.battery_level == null
        ? 'Batterie : indisponible'
        : `Batterie : ${myProfile.battery_level}%`;
  }

  if (myUpdatedAt) {
    myUpdatedAt.textContent =
      myProfile.updated_at
        ? 'Mise à jour : ' + new Date(myProfile.updated_at).toLocaleString('fr-FR')
        : 'Aucune mise à jour';
  }
}

/* =========================================================
   RECHERCHER UN MEMBRE
   ========================================================= */

async function observerAmi(event) {
  if (event) event.preventDefault();

  if (!currentUser) {
    afficherResultat('Connecte-toi pour rechercher un membre.', 'error');
    return;
  }

  const targetId = searchGpsId?.value.trim() || '';

  if (!/^[1-9][0-9]*$/.test(targetId)) {
    afficherResultat('Entre un identifiant GPS numérique valide.', 'error');
    return;
  }

  if (locateButton) locateButton.disabled = true;

  try {
    const member = await rechercherMembre(targetId);

    if (!member) {
      arreterActualisationRecherche();

      afficherResultat('Aucun membre trouvé avec cet identifiant.', 'warning');
      return;
    }

    currentTargetId = String(member.member_id);

    if (!member.sharing_enabled) {
      arreterActualisationRecherche();

      afficherResultat(
        `${member.member_name} ne partage pas actuellement sa position.`,
        'warning'
      );

      return;
    }

    if (member.member_latitude == null || member.member_longitude == null) {
      afficherResultat(
        `${member.member_name} a activé le partage, mais aucune position n'est encore disponible.`,
        'warning'
      );

      demarrerActualisationRecherche();
      return;
    }

    afficherPositionMembre({
      id: member.member_id,
      name: member.member_name,
      latitude: member.member_latitude,
      longitude: member.member_longitude,
      battery_level: member.member_battery
    });

    afficherResultat(
      `Position partagée de ${member.member_name}. Actualisation automatique toutes les 10 secondes lorsque l'application est active.`,
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
    if (locateButton) locateButton.disabled = false;
  }
}

/* =========================================================
   APPEL DE LA FONCTION SQL
   ========================================================= */

async function rechercherMembre(memberId) {
  const { data, error } = await db.rpc('find_family_member', {
    p_member_id: Number(memberId)
  });

  if (error) throw error;

  return Array.isArray(data) ? (data[0] || null) : data;
}

/* =========================================================
   AFFICHER LA POSITION D'UN PROCHE
   ========================================================= */

function afficherPositionMembre(member) {
  if (member.latitude == null || member.longitude == null) return;

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
    afficherResultat('Coordonnées GPS invalides.', 'error');
    return;
  }

  const id = String(member.id);
  const coordinates = [latitude, longitude];

  if (markers[id]) {
    markers[id].setLatLng(coordinates);
  } else {
    markers[id] = L.marker(coordinates).addTo(map);
  }

  const popup = document.createElement('div');
  const name = document.createElement('strong');
  const idLine = document.createElement('div');

  name.textContent = member.name || 'Membre';
  idLine.textContent = `ID GPS : ${member.id}`;

  popup.append(name, idLine);

  markers[id].bindPopup(popup).openPopup();

  map.setView(coordinates, 15);
}

/* =========================================================
   ACTUALISATION AUTOMATIQUE DE LA RECHERCHE
   ========================================================= */

function demarrerActualisationRecherche() {
  arreterActualisationRecherche(false);

  searchInterval = setInterval(async () => {
    if (!currentTargetId || !currentUser) return;

    try {
      const member = await rechercherMembre(currentTargetId);

      if (!member || !member.sharing_enabled) {
        arreterActualisationRecherche();

        afficherResultat(
          'Ce membre ne partage plus sa position.',
          'warning'
        );

        if (markers[currentTargetId] && map) {
          map.removeLayer(markers[currentTargetId]);
          delete markers[currentTargetId];
        }

        return;
      }

      if (member.member_latitude == null || member.member_longitude == null) {
        afficherResultat(
          `${member.member_name} partage sa position, mais aucune position n'est disponible.`,
          'warning'
        );
        return;
      }

      afficherPositionMembre({
        id: member.member_id,
        name: member.member_name,
        latitude: member.member_latitude,
        longitude: member.member_longitude,
        battery_level: member.member_battery
      });

    } catch (error) {
      console.error('Actualisation :', error);
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

/* =========================================================
   COPIER MON IDENTIFIANT GPS
   ========================================================= */

if (copyIdBtn) {
  copyIdBtn.addEventListener('click', async () => {
    if (!myProfile) return;

    try {
      await navigator.clipboard.writeText(String(myProfile.id));
      afficherMessage('Identifiant GPS copié !', 'success');
    } catch (error) {
      afficherMessage(
        'Impossible de copier automatiquement. Ton ID est : ' + myProfile.id,
        'warning'
      );
    }
  });
}

/* =========================================================
   DÉCONNEXION
   ========================================================= */

async function deconnecterUtilisateur() {
  if (!currentUser) return;

  if (myProfile?.share_enabled) {
    const confirmation = confirm(
      'Ton partage GPS est activé. Veux-tu le désactiver et effacer tes coordonnées avant de te déconnecter ?'
    );

    if (confirmation) {
      await arreterPartageGPS();

      if (myProfile?.share_enabled) {
        afficherMessage(
          'La désactivation du partage n’a pas été confirmée. Déconnexion annulée.',
          'error'
        );
        return;
      }
    } else {
      // Le partage reste autorisé côté serveur.
      // Le suivi de cet appareil s'arrête néanmoins.
      arreterSuiviLocal();
    }
  } else {
    arreterSuiviLocal();
  }

  arreterActualisationRecherche();

  const { error } = await db.auth.signOut();

  if (error) {
    afficherMessage('Erreur de déconnexion : ' + error.message, 'error');
    return;
  }

  currentUser = null;
  myProfile = null;

  afficherConnexion();
  afficherFormulaire('login');
  afficherMessage('Tu es déconnecté.', 'success');
}

/* =========================================================
   ÉVÉNEMENTS
   ========================================================= */

if (registerForm) {
  registerForm.addEventListener('submit', inscrireUtilisateur);
}

if (loginForm) {
  loginForm.addEventListener('submit', connecterUtilisateur);
}

if (startSharingBtn) {
  startSharingBtn.addEventListener('click', demarrerPartageGPS);
}

if (stopSharingBtn) {
  stopSharingBtn.addEventListener('click', arreterPartageGPS);
}

if (searchForm) {
  searchForm.addEventListener('submit', observerAmi);
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', deconnecterUtilisateur);
}

/* =========================================================
   RESTAURATION DE SESSION
   ========================================================= */

async function restaurerSession() {
  if (!db) return;

  try {
    const { data, error } = await db.auth.getSession();

    if (error) throw error;

    if (data.session?.user) {
      await chargerProfil(data.session.user);
    } else {
      afficherConnexion();
    }

  } catch (error) {
    console.error('Restauration session :', error);
    afficherConnexion();
    afficherMessage('Impossible de restaurer la session.', 'error');
  }
}

/* =========================================================
   ÉCOUTER LES CHANGEMENTS D'AUTHENTIFICATION
   ========================================================= */

if (db) {
  const { data } = db.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      currentUser = null;
      myProfile = null;
      arreterSuiviLocal();
      afficherConnexion();
    }
  });

  authSubscription = data.subscription;
}

/* =========================================================
   SERVICE WORKER
   ========================================================= */

async function enregistrerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  try {
    await navigator.serviceWorker.register('./sw.js');
    console.log('Service Worker activé.');
  } catch (error) {
    console.error('Service Worker :', error);
  }
}

/* =========================================================
   DÉMARRAGE
   ========================================================= */

document.addEventListener('DOMContentLoaded', async () => {
  afficherFormulaire('register');

  await restaurerSession();

  enregistrerServiceWorker();

  if (navigator.getBattery) {
    obtenirBatterie().then(niveau => {
      if (myBattery && niveau !== null) {
        myBattery.textContent = `Batterie : ${niveau}%`;
      }
    });
  }

  console.log('Famille GPS - Application initialisée.');
});

/* Compatibilité éventuelle avec les anciens appels */
window.observerAmi = observerAmi;
