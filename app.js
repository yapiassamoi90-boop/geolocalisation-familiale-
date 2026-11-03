/* =========================================================
   FAMILLE GPS - Dev.Assamoi
   Supabase + Leaflet + GPS volontaire
   ========================================================= */

'use strict';

/* CONFIGURATION */
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
let messageTimeout = null;

/* ELEMENTS HTML */
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

/* INITIALISATION SUPABASE */
try {
  if (!window.supabase) {
    throw new Error('Bibliothèque Supabase introuvable.');
  }

  db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

} catch (error) {
  console.error(error);
}

/* MESSAGES */
function afficherMessage(message, type = 'info') {
  if (!messageBox) return;

  messageBox.textContent = message;
  messageBox.className = `message-box ${type}`;
  messageBox.classList.remove('hidden');

  clearTimeout(messageTimeout);

  messageTimeout = setTimeout(() => {
    messageBox.classList.add('hidden');
  }, 5000);
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

/* AFFICHAGE DES ÉCRANS */
function afficherConnexion() {
  authSection?.classList.remove('hidden');
  appSection?.classList.add('hidden');
  logoutBtn?.classList.add('hidden');

  arreterActualisationRecherche();
  arreterSuiviLocal();
}

function afficherApplication() {
  authSection?.classList.add('hidden');
  appSection?.classList.remove('hidden');
  logoutBtn?.classList.remove('hidden');

  setTimeout(() => {
    initialiserCarte();
    map?.invalidateSize();
  }, 300);
}

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

/* INSCRIPTION */
async function inscrireUtilisateur(event) {
  event.preventDefault();

  if (!db) {
    return afficherMessage('Supabase est indisponible.', 'error');
  }

  const name = registerName?.value.trim() || '';
  const email = registerEmail?.value.trim() || '';
  const password = registerPassword?.value || '';

  if (name.length < 2) {
    return afficherMessage('Entre ton nom complet.', 'error');
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return afficherMessage('Entre une adresse email valide.', 'error');
  }

  if (password.length < 8) {
    return afficherMessage(
      'Le mot de passe doit contenir au moins 8 caractères.',
      'error'
    );
  }

  const button = registerForm.querySelector('[type="submit"]');

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

      afficherMessage(
        'Inscription réussie ! Ton profil GPS a été créé.',
        'success'
      );

    } else {
      registerForm.reset();

      afficherFormulaire('login');

      if (loginEmail) {
        loginEmail.value = email;
      }

      afficherMessage(
        'Inscription enregistrée. Vérifie ton email, puis connecte-toi.',
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

/* CONNEXION */
async function connecterUtilisateur(event) {
  event.preventDefault();

  if (!db) {
    return afficherMessage('Supabase est indisponible.', 'error');
  }

  const email = loginEmail?.value.trim() || '';
  const password = loginPassword?.value || '';

  if (!email || !password) {
    return afficherMessage(
      'Renseigne ton email et ton mot de passe.',
      'error'
    );
  }

  const button = loginForm.querySelector('[type="submit"]');

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

    let message = error.message;

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

/* CHARGEMENT DU PROFIL */
async function chargerProfil(user) {
  if (!user || !db) return;

  currentUser = user;

  try {
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
      .eq('auth_user_id', user.id)
      .single();

    if (error) throw error;

    if (!data) {
      throw new Error('Profil GPS introuvable.');
    }

    myProfile = data;

    if (userName) {
      userName.textContent = data.name;
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
        'Le partage est activé sur ton compte. Appuie sur Activer pour reprendre le suivi sur cet appareil.',
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

/* STATUT DU PARTAGE */
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
    startSharingBtn.disabled = active || gpsStarting;
  }

  if (stopSharingBtn) {
    stopSharingBtn.disabled = !active || gpsStopping;
  }
}

/* INITIALISATION DE LA CARTE */
function initialiserCarte() {
  const element = $('map');

  if (!element || typeof L === 'undefined') {
    console.error('Carte Leaflet indisponible.');
    return;
  }

  if (map) {
    map.invalidateSize();
    return;
  }

  map = L.map('map').setView([5.36, -4.0083], 12);

  L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }
  ).addTo(map);
}

/* ICONES GPS */
function creerIconeGPS(couleur) {
  return L.divIcon({
    className: '',
    html: `<span class="gps-marker ${couleur}"></span>`,
    iconSize: [25, 25],
    iconAnchor: [12, 12]
  });
}

/* AFFICHER MA POSITION */
function afficherMaPosition(latitude, longitude) {
  initialiserCarte();

  if (!map) return;

  const position = [
    Number(latitude),
    Number(longitude)
  ];

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

/* OBTENIR LA POSITION GPS */
function obtenirPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(
        new Error('Géolocalisation non disponible.')
      );
    }

    navigator.geolocation.getCurrentPosition(
      resolve,

      error => {
        const messages = {
          1: 'Autorise la localisation dans ton navigateur.',
          2: 'Position GPS indisponible.',
          3: 'La demande GPS a expiré. Réessaie.'
        };

        reject(
          new Error(
            messages[error.code] || 'Erreur GPS.'
          )
        );
      },

      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000
      }
    );
  });
}

/* BATTERIE */
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

/* ACTIVER LE PARTAGE GPS */
async function demarrerPartageGPS() {
  if (gpsStarting || gpsWatchId !== null) return;

  if (!currentUser || !myProfile) {
    return afficherMessage(
      'Connecte-toi avant d’activer le GPS.',
      'warning'
    );
  }

  if (!window.isSecureContext || !navigator.geolocation) {
    return afficherMessage(
      'Le GPS nécessite HTTPS et un appareil compatible.',
      'error'
    );
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
          console.error('Erreur GPS :', error);

          afficherMessage(
            'Mise à jour GPS impossible : ' + error.message,
            'error'
          );
        });
      },

      error => {
        console.error('Suivi GPS :', error);

        afficherMessage(
          'Suivi GPS interrompu. Vérifie les autorisations de localisation.',
          'error'
        );
      },

      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000
      }
    );

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
          '. Le partage serveur n’a pas pu être désactivé : ' +
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
