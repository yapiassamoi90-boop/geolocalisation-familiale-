/* =========================================================
   FAMILLE LOCALIZER - Dev.Assamoi
   Supabase + Leaflet + partage GPS volontaire
   ========================================================= */

'use strict';

/* =========================================================
   CONFIGURATION SUPABASE
   ========================================================= */

const SUPABASE_URL =
  'https://qcdxsafopgihmdwudayb.supabase.co';

const SUPABASE_ANON_KEY =
  'sb_publishable_sSgPsSwF436uHqtqgF9ytw_RKqqwIjt';

let supabaseClient = null;

try {

  if (!window.supabase) {
    throw new Error('La bibliothèque Supabase ne s’est pas chargée.');
  }

  supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );

} catch (error) {

  console.error('Erreur Supabase :', error);

}

/* =========================================================
   ÉLÉMENTS HTML
   ========================================================= */

const $ = (id) => document.getElementById(id);

const authScreen = $('auth-screen');
const appScreen = $('app-screen');

const authForm = $('auth-form');
const usernameInput = $('username');

const myIdSpan = $('my-id');
const userBadge = $('user-badge');

const statusDot = $('status-dot');
const statusText = $('status-text');

const jsStatus = $('js-status');
const authMessage = $('auth-message');
const locationMessage = $('location-message');

const targetIdInput = $('target-id');
const searchForm = $('search-form');

const registerButton = $('register-button');
const locateButton = $('locate-button');

const startButton = $('start-sharing-button');
const stopButton = $('stop-sharing-button');

const batteryText = $('battery-text');
const logoutButton = $('logout-button');

/* =========================================================
   VARIABLES DE L'APPLICATION
   ========================================================= */

let map = null;

let markers = {};

let gpsWatchId = null;

let searchInterval = null;

let myUserId = localStorage.getItem('family_user_id');

let myUserName = localStorage.getItem('family_user_name');

let currentTargetId = null;

let gpsStarting = false;

let gpsStopping = false;

let batteryObject = null;

/* =========================================================
   AFFICHAGE DES MESSAGES
   ========================================================= */

function afficherMessage(element, message, type = 'info') {

  if (!element) return;

  element.textContent = message;

  element.className = `notice ${type}`;

}

/* =========================================================
   STATUT GPS
   ========================================================= */

function changerStatutGPS(message, couleur = 'gray') {

  if (statusText) {

    statusText.textContent = message;

  }

  if (statusDot) {

    statusDot.className =
      `status-dot ${couleur === 'gray' ? '' : couleur}`;

  }

}

/* =========================================================
   INITIALISATION
   ========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  initialiserApplication
);

function initialiserApplication() {

  if (!supabaseClient) {

    afficherMessage(
      jsStatus,
      'Connexion Supabase impossible. Vérifie les clés et les scripts.',
      'error'
    );

  } else {

    afficherMessage(
      jsStatus,
      'Application prête. Inscris-toi ou reprends ta session.',
      'success'
    );

  }

  if (authForm) {

    authForm.addEventListener(
      'submit',
      inscrireMembre
    );

  }

  if (searchForm) {

    searchForm.addEventListener('submit', (event) => {

      event.preventDefault();

      observerAmi();

    });

  }

  if (startButton) {

    startButton.addEventListener(
      'click',
      demarrerPartageGPS
    );

  }

  if (stopButton) {

    stopButton.addEventListener(
      'click',
      arreterPartageGPS
    );

  }

  if (logoutButton) {

    logoutButton.addEventListener(
      'click',
      changerSession
    );

  }

  if (myUserId && myUserName) {

    lancerApplication(myUserId);

  }

  initialiserBatterie();

  changerStatutGPS(
    'GPS désactivé : active le partage lorsque tu es prêt.',
    'gray'
  );

  enregistrerServiceWorker();

}

/* =========================================================
   INSCRIPTION D'UN MEMBRE
   ========================================================= */

async function inscrireMembre(event) {

  event.preventDefault();

  if (!supabaseClient) {

    afficherMessage(
      authMessage,
      'Supabase est indisponible.',
      'error'
    );

    return;

  }

  const name = usernameInput
    ? usernameInput.value.trim()
    : '';

  if (name.length < 2) {

    afficherMessage(
      authMessage,
      'Entre un nom comprenant au moins deux caractères.',
      'error'
    );

    return;

  }

  if (registerButton) {

    registerButton.disabled = true;

    registerButton.textContent =
      'Inscription en cours…';

  }

  try {

    const { data, error } = await supabaseClient

      .from('family_users')

      .insert({
        name: name
      })

      .select('id, name')

      .single();

    if (error) throw error;

    if (!data || data.id == null) {

      throw new Error(
        'Identifiant du membre introuvable.'
      );

    }

    myUserId = String(data.id);

    myUserName = data.name;

    localStorage.setItem(
      'family_user_id',
      myUserId
    );

    localStorage.setItem(
      'family_user_name',
      myUserName
    );

    lancerApplication(myUserId);

    afficherMessage(
      locationMessage,
      `Bienvenue ${myUserName} ! Ton partage GPS est désactivé. Active-le uniquement si tu le souhaites.`,
      'success'
    );

  } catch (error) {

    console.error(
      'Erreur inscription :',
      error
    );

    afficherMessage(
      authMessage,
      'Erreur Supabase : ' +
      (error.message || 'erreur inconnue'),
      'error'
    );

  } finally {

    if (registerButton) {

      registerButton.disabled = false;

      registerButton.textContent =
        'Obtenir mon ID et démarrer';

    }

  }

}

/* =========================================================
   OUVERTURE DE L'APPLICATION
   ========================================================= */

function lancerApplication(userId) {

  myUserId = String(userId);

  if (authScreen) {

    authScreen.classList.add('hidden');

  }

  if (appScreen) {

    appScreen.classList.remove('hidden');

  }

  if (userBadge) {

    userBadge.classList.remove('hidden');

  }

  if (myIdSpan) {

    myIdSpan.textContent = myUserId;

  }

  setTimeout(
    initialiserCarte,
    250
  );

}

/* =========================================================
   FERMER LA SESSION
   ========================================================= */

async function changerSession() {

  // Si le partage GPS est actif, tenter de l'arrêter
  // et d'effacer les anciennes coordonnées avant de quitter.

  if (gpsWatchId !== null) {

    await arreterPartageGPS();

    // Si la suppression a échoué, ne pas fermer la session.
    if (gpsWatchId !== null) {

      afficherMessage(
        locationMessage,
        'Impossible de confirmer l’arrêt du partage. Réessaie avant de quitter.',
        'error'
      );

      return;

    }

  }

  arreterActualisationRecherche();

  localStorage.removeItem('family_user_id');

  localStorage.removeItem('family_user_name');

  myUserId = null;

  myUserName = null;

  if (appScreen) {

    appScreen.classList.add('hidden');

  }

  if (userBadge) {

    userBadge.classList.add('hidden');

  }

  if (authScreen) {

    authScreen.classList.remove('hidden');

  }

  changerStatutGPS(
    'GPS désactivé',
    'gray'
  );

  afficherMessage(
    authMessage,
    'Tu as fermé ta session.',
    'success'
  );

}

/* =========================================================
   INITIALISATION DE LA CARTE
   ========================================================= */

function initialiserCarte() {

  const mapElement = $('map');

  if (!mapElement || typeof L === 'undefined') {

    afficherMessage(
      locationMessage,
      'Carte indisponible. Vérifie le chargement de Leaflet.',
      'error'
    );

    return;

  }

  if (!map) {

    // Abidjan est uniquement le centre initial de la carte.

    map = L.map('map').setView(
      [5.3600, -4.0083],
      12
    );

    L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }
    ).addTo(map);

  }

  setTimeout(() => {

    map.invalidateSize();

  }, 100);

}

/* =========================================================
   OBTENIR LA POSITION GPS
   ========================================================= */

function obtenirPositionActuelle() {

  return new Promise((resolve, reject) => {

    navigator.geolocation.getCurrentPosition(

      resolve,

      (error) => {

        let message =
          'Impossible d’obtenir la position GPS.';

        if (error.code === 1) {

          message =
            'Autorise la localisation dans ton navigateur.';

        } else if (error.code === 2) {

          message =
            'Le GPS ne parvient pas à déterminer ta position.';

        } else if (error.code === 3) {

          message =
            'La demande GPS a expiré. Réessaie.';

        }

        reject(new Error(message));

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
   ACTIVER LE PARTAGE GPS
   ========================================================= */

async function demarrerPartageGPS() {

  if (gpsStarting || gpsWatchId !== null) return;

  if (!myUserId) {

    afficherMessage(
      locationMessage,
      'Inscris-toi avant d’activer le GPS.',
      'warning'
    );

    return;

  }

  if (!navigator.geolocation) {

    afficherMessage(
      locationMessage,
      'Ton appareil ne prend pas en charge la géolocalisation.',
      'error'
    );

    return;

  }

  if (!window.isSecureContext) {

    afficherMessage(
      locationMessage,
      'Le GPS nécessite une connexion HTTPS ou localhost.',
      'error'
    );

    return;

  }

  gpsStarting = true;

  if (startButton) {

    startButton.disabled = true;

    startButton.textContent =
      'Activation du GPS…';

  }

  changerStatutGPS(
    'Demande d’autorisation GPS…',
    'amber'
  );

  try {

    // Vérifier d'abord l'autorisation GPS.

    await obtenirPositionActuelle();

    // Démarrer le suivi continu.

    gpsWatchId = navigator.geolocation.watchPosition(

      async (position) => {

        try {

          await traiterNouvellePosition(position);

        } catch (error) {

          console.error(
            'Erreur enregistrement GPS :',
            error
          );

          afficherMessage(
            locationMessage,
            'Erreur lors de l’enregistrement GPS : ' +
            error.message,
            'error'
          );

        }

      },

      (error) => {

        let message =
          'Impossible de récupérer la position GPS.';

        if (error.code === 1) {

          message =
            'Autorisation GPS refusée. Autorise la localisation dans ton navigateur.';

        } else if (error.code === 2) {

          message =
            'Position indisponible. Vérifie le GPS de ton appareil.';

        } else if (error.code === 3) {

          message =
            'Le GPS met trop de temps à répondre. Réessaie.';

        }

        changerStatutGPS(
          message,
          'red'
        );

        afficherMessage(
          locationMessage,
          message,
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
      locationMessage,
      'Partage GPS activé. Tu peux l’arrêter à tout moment.',
      'success'
    );

  } catch (error) {

    changerStatutGPS(
      'GPS indisponible',
      'red'
    );

    afficherMessage(
      locationMessage,
      error.message || 'Impossible d’activer le GPS.',
      'error'
    );

  } finally {

    gpsStarting = false;

    if (startButton) {

      startButton.disabled = false;

      startButton.textContent =
        'Activer le partage GPS';

    }

  }

}

/* =========================================================
   ENREGISTRER LA POSITION GPS
   ========================================================= */

async function traiterNouvellePosition(position) {

  if (!myUserId || gpsWatchId === null) return;

  const latitude =
    position.coords.latitude;

  const longitude =
    position.coords.longitude;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {

    throw new Error(
      'Coordonnées GPS invalides.'
    );

  }

  const coordinates = [
    latitude,
    longitude
  ];

  // Afficher ma position sur la carte.

  if (map) {

    if (markers.me) {

      markers.me.setLatLng(coordinates);

    } else {

      markers.me = L.marker(coordinates)
        .addTo(map)
        .bindPopup('Ma position');

    }

    map.setView(
      coordinates,
      15
    );

  }

  changerStatutGPS(
    'Partage GPS actif',
    'green'
  );

  // Enregistrer la position dans Supabase.

  const { error } = await supabaseClient

    .from('family_users')

    .update({
      latitude: latitude,
      longitude: longitude
    })

    .eq('id', myUserId);

  if (error) throw error;

}

/* =========================================================
   ARRÊTER LE PARTAGE GPS
   ========================================================= */

async function arreterPartageGPS() {

  if (gpsStopping) return;

  gpsStopping = true;

  if (stopButton) {

    stopButton.disabled = true;

    stopButton.textContent =
      'Arrêt en cours…';

  }

  try {

    // Arrêter immédiatement le suivi local.

    if (
      gpsWatchId !== null &&
      navigator.geolocation
    ) {

      navigator.geolocation.clearWatch(
        gpsWatchId
      );

      gpsWatchId = null;

    }

    if (!myUserId) {

      throw new Error(
        'Aucun membre connecté.'
      );

    }

    // Effacer les anciennes coordonnées GPS.

    const { error } = await supabaseClient

      .from('family_users')

      .update({
        latitude: null,
        longitude: null
      })

      .eq('id', myUserId);

    if (error) throw error;

    // Supprimer mon marqueur de la carte.

    if (markers.me && map) {

      map.removeLayer(markers.me);

      delete markers.me;

    }

    changerStatutGPS(
      'Partage GPS arrêté',
      'gray'
    );

    afficherMessage(
      locationMessage,
      'Partage arrêté. Les anciennes coordonnées ont été effacées.',
      'success'
    );

  } catch (error) {

    console.error(
      'Erreur arrêt GPS :',
      error
    );

    afficherMessage(
      locationMessage,
      'Le GPS local est arrêté, mais la suppression de la position a échoué : ' +
      error.message,
      'error'
    );

  } finally {

    gpsStopping = false;

    if (stopButton) {

      stopButton.disabled = false;

      stopButton.textContent =
        'Arrêter';

    }

  }

}

/* =========================================================
   RECHERCHER UN PROCHE
   ========================================================= */

async function observerAmi() {

  const targetId = targetIdInput
    ? targetIdInput.value.trim()
    : '';

  if (!targetId) {

    afficherMessage(
      locationMessage,
      'Entre l’identifiant de ton proche.',
      'warning'
    );

    return;

  }

  if (!supabaseClient) {

    afficherMessage(
      locationMessage,
      'Connexion Supabase indisponible.',
      'error'
    );

    return;

  }

  if (locateButton) {

    locateButton.disabled = true;

    locateButton.textContent =
      'Recherche…';

  }

  try {

    const { data, error } = await supabaseClient

      .from('family_users')

      .select(
        'id, name, latitude, longitude'
      )

      .eq('id', targetId)

      .maybeSingle();

    if (error) throw error;

    if (!data) {

      arreterActualisationRecherche();

      afficherMessage(
        locationMessage,
        'Aucun membre trouvé avec cet identifiant.',
        'warning'
      );

      return;

    }

    currentTargetId = String(data.id);

    if (
      data.latitude == null ||
      data.longitude == null
    ) {

      arreterActualisationRecherche();

      afficherMessage(
        locationMessage,
        `${data.name} ne partage pas actuellement sa position GPS.`,
        'warning'
      );

      return;

    }

    afficherPositionMembre(data);

    afficherMessage(
      locationMessage,
      `Position partagée de ${data.name}. Actualisation toutes les 10 secondes.`,
      'success'
    );

    demarrerActualisationRecherche();

  } catch (error) {

    console.error(
      'Erreur recherche :',
      error
    );

    afficherMessage(
      locationMessage,
      'Recherche impossible : ' +
      (error.message || 'erreur inconnue'),
      'error'
    );

  } finally {

    if (locateButton) {

      locateButton.disabled = false;

      locateButton.textContent =
        '📍 Localiser';

    }

  }

}

/* =========================================================
   AFFICHER LA POSITION D'UN PROCHE
   ========================================================= */

function afficherPositionMembre(member) {

  initialiserCarte();

  if (!map) return;

  const id = String(member.id);

  const latitude =
    Number(member.latitude);

  const longitude =
    Number(member.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {

    afficherMessage(
      locationMessage,
      'Coordonnées GPS invalides.',
      'error'
    );

    return;

  }

  const coordinates = [
    latitude,
    longitude
  ];

  if (markers[id]) {

    markers[id].setLatLng(
      coordinates
    );

  } else {

    markers[id] = L.marker(
      coordinates
    ).addTo(map);

  }

  // Construire une fenêtre sécurisée.

  const popup = document.createElement('div');

  const name = document.createElement('strong');

  const idLine = document.createElement('div');

  name.textContent =
    member.name || 'Membre';

  idLine.textContent =
    `ID : ${member.id}`;

  popup.append(
    name,
    idLine
  );

  markers[id]
    .bindPopup(popup)
    .openPopup();

  map.setView(
    coordinates,
    15
  );

}

/* =========================================================
   ACTUALISATION AUTOMATIQUE
   ========================================================= */

function demarrerActualisationRecherche() {

  arreterActualisationRecherche(false);

  searchInterval = setInterval(async () => {

    if (!currentTargetId) return;

    try {

      const { data, error } = await supabaseClient

        .from('family_users')

        .select(
          'id, name, latitude, longitude'
        )

        .eq('id', currentTargetId)

        .maybeSingle();

      if (error) throw error;

      if (
        !data ||
        data.latitude == null ||
        data.longitude == null
      ) {

        afficherMessage(
          locationMessage,
          'Ce membre ne partage plus sa position GPS.',
          'warning'
        );

        arreterActualisationRecherche();

        return;

      }

      afficherPositionMembre(data);

    } catch (error) {

      console.error(
        'Erreur actualisation GPS :',
        error
      );

    }

  }, 10000);

}

function arreterActualisationRecherche(
  effacerCible = true
) {

  if (searchInterval !== null) {

    clearInterval(searchInterval);

    searchInterval = null;

  }

  if (effacerCible) {

    currentTargetId = null;

  }

}

/* =========================================================
   INFORMATIONS DE LA BATTERIE
   ========================================================= */

async function initialiserBatterie() {

  if (
    !batteryText ||
    !navigator.getBattery
  ) return;

  try {

    batteryObject = await navigator.getBattery();

    function actualiserBatterie() {

      const niveau = Math.round(
        batteryObject.level * 100
      );

      batteryText.textContent =
        `🔋 Batterie : ${niveau}%` +
        (
          batteryObject.charging
            ? ' · En charge'
            : ''
        );

    }

    actualiserBatterie();

    batteryObject.addEventListener(
      'levelchange',
      actualiserBatterie
    );

    batteryObject.addEventListener(
      'chargingchange',
      actualiserBatterie
    );

  } catch (error) {

    console.warn(
      'Batterie indisponible :',
      error
    );

  }

}

/* =========================================================
   ENREGISTREMENT DU SERVICE WORKER
   ========================================================= */

async function enregistrerServiceWorker() {

  if (!('serviceWorker' in navigator)) return;

  if (!window.isSecureContext) return;

  try {

    await navigator.serviceWorker.register(
      './sw.js'
    );

    console.log(
      'Service Worker enregistré avec succès.'
    );

  } catch (error) {

    console.error(
      'Erreur Service Worker :',
      error
    );

  }

}

/* =========================================================
   COMPATIBILITÉ AVEC LES ANCIENS BOUTONS
   ========================================================= */

window.observerAmi = observerAmi;
